import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { Env } from '../../../../../shared/config/env.schema';
import type { AudioChunk } from '../../domain/audio-chunk';
import type { ChunkWord } from '../../domain/chunk-word';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../../domain/errors';
import type { TranscriptionUsage } from '../../domain/transcription-usage';
import {
    ChunkTranscriberPort,
    type ChunkTranscription,
} from '../../domain/ports/chunk-transcriber.port';

/** Retries of one chunk inside a job run, on top of the first request. */
export const CHUNK_MAX_RETRIES = 2;

const PERMANENT_STATUSES = new Set([400, 413, 422]);
const AUTH_STATUSES = new Set([401, 403]);
const TRAILING_SLASHES = /\/+$/;
const SPEAKER_PREFIX = /^speaker[_\s-]?(\d+)$/i;
const UNKNOWN_SPEAKER = 'unknown';

const label = z.union([z.number(), z.string()]).nullish();

// Field names vary between the provider and OpenRouter: word/text, speaker/speaker_label/speaker_id.
const wordSchema = z.object({
    word: z.string().nullish(),
    text: z.string().nullish(),
    type: z.string().nullish(),
    start: z.number().nullish(),
    end: z.number().nullish(),
    speaker: label,
    speaker_label: label,
    speaker_id: label,
});

const responseSchema = z.object({
    error: z.unknown().optional(),
    language: z.string().nullish(),
    words: z.array(z.unknown()).nullish(),
    usage: z.unknown().optional(),
});

// OpenRouter: `usage: { seconds, cost }`; без обоих полей стоимость неизвестна.
const usageSchema = z
    .object({
        seconds: z.number().nonnegative().optional(),
        cost: z.number().nonnegative().optional(),
    })
    .refine((usage) => usage.seconds !== undefined || usage.cost !== undefined);

export interface ChunkTranscriberSettings {
    readonly apiKey: string | undefined;
    readonly baseUrl: string;
    readonly model: string;
    readonly language: string | undefined;
    readonly timeoutMs: number;
    /** Base pause before a retry; grows with the attempt number. */
    readonly retryDelayMs: number;
}

/**
 * Sends a chunk to `POST {OPENROUTER_BASE_URL}/audio/transcriptions` (`elevenlabs/scribe-v2`
 * with diarization). Logs carry only the chunk index, attempt and HTTP status.
 */
export class ChunkTranscriber extends ChunkTranscriberPort {
    constructor(
        private readonly settings: ChunkTranscriberSettings,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(ChunkTranscriber.name);
    }

    static settingsFromConfig(config: ConfigService<Env, true>): ChunkTranscriberSettings {
        return {
            apiKey: config.get('OPENROUTER_API_KEY', { infer: true }),
            baseUrl: config.get('OPENROUTER_BASE_URL', { infer: true }),
            model: config.get('MEETING_TRANSCRIPTION_MODEL', { infer: true }),
            language: config.get('MEETING_TRANSCRIPTION_LANGUAGE', { infer: true }),
            timeoutMs: config.get('MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS', { infer: true }),
            retryDelayMs: 2000,
        };
    }

    async transcribe(chunk: AudioChunk, signal: AbortSignal): Promise<ChunkTranscription> {
        const { apiKey } = this.settings;
        if (apiKey === undefined || apiKey === '') {
            this.logger.error({ reason: 'not_configured' }, 'OPENROUTER_API_KEY is not configured');
            throw new TranscriptionTemporaryError(
                'OPENROUTER_API_KEY is not configured',
                undefined,
                {
                    reason: 'not_configured',
                },
            );
        }
        const body = await this.requestBody(chunk);

        for (let attempt = 0; ; attempt++) {
            try {
                return await this.attempt(apiKey, body, chunk.index, signal);
            } catch (error: unknown) {
                if (!(error instanceof TranscriptionTemporaryError) || signal.aborted) throw error;
                if (attempt >= CHUNK_MAX_RETRIES) throw error;
                this.logger.warn(
                    { chunkIndex: chunk.index, retry: attempt + 1, maxRetries: CHUNK_MAX_RETRIES },
                    'Chunk transcription failed temporarily',
                );
                await delay(this.settings.retryDelayMs * (attempt + 1), undefined, { signal });
            }
        }
    }

    private async requestBody(chunk: AudioChunk): Promise<string> {
        const audio = await readFile(chunk.path);
        const { language } = this.settings;
        return JSON.stringify({
            model: this.settings.model,
            input_audio: { data: audio.toString('base64'), format: 'ogg' },
            response_format: 'verbose_json',
            timestamp_granularities: ['word'],
            diarize: true,
            ...(language !== undefined && language !== '' ? { language } : {}),
        });
    }

    private async attempt(
        apiKey: string,
        body: string,
        index: number,
        signal: AbortSignal,
    ): Promise<ChunkTranscription> {
        const timeout = AbortSignal.timeout(this.settings.timeoutMs);
        const baseUrl = this.settings.baseUrl.replace(TRAILING_SLASHES, '');
        let response: Response;
        try {
            response = await fetch(`${baseUrl}/audio/transcriptions`, {
                method: 'POST',
                signal: AbortSignal.any([signal, timeout]),
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body,
            });
        } catch (error: unknown) {
            throw this.requestError(error, index, signal, timeout);
        }

        const status = response.status;
        if (!response.ok) throw this.statusError(status, index);

        let parsed: z.infer<typeof responseSchema> | undefined;
        try {
            parsed = responseSchema.safeParse(await response.json()).data;
        } catch (error: unknown) {
            if (signal.aborted) throw error;
            if (timeout.aborted) throw timeoutError(index);
        }
        if (parsed === undefined || parsed.error !== undefined) {
            this.logger.warn({ chunkIndex: index, status }, 'Invalid chunk transcription response');
            throw new TranscriptionTemporaryError(
                'OpenRouter returned an invalid response',
                undefined,
                {
                    status,
                    reason: 'invalid_response',
                },
            );
        }
        return {
            language: parsed.language ?? null,
            words: toWords(parsed.words ?? []),
            usage: usageOf(parsed.usage),
        };
    }

    private requestError(
        error: unknown,
        index: number,
        signal: AbortSignal,
        timeout: AbortSignal,
    ): unknown {
        if (signal.aborted) return error;
        if (timeout.aborted) {
            this.logger.warn({ chunkIndex: index }, 'Chunk transcription request timed out');
            return timeoutError(index);
        }
        const cause = error instanceof Error ? error : undefined;
        this.logger.warn(
            { chunkIndex: index, errorName: cause?.name ?? 'unknown' },
            'Chunk transcription request failed',
        );
        return new TranscriptionTemporaryError('OpenRouter request failed', cause, {
            reason: cause?.name ?? 'unknown',
        });
    }

    private statusError(status: number, index: number): Error {
        const message = `OpenRouter chunk transcription failed with HTTP ${String(status)}`;
        if (PERMANENT_STATUSES.has(status)) {
            this.logger.warn({ chunkIndex: index, status }, 'Provider rejected the chunk');
            return new TranscriptionPermanentError('unsupported-media', message, undefined, {
                status,
            });
        }
        if (AUTH_STATUSES.has(status)) {
            this.logger.error({ chunkIndex: index, status }, 'OpenRouter refused the API key');
        } else {
            this.logger.warn({ chunkIndex: index, status }, 'Chunk transcription request failed');
        }
        return new TranscriptionTemporaryError(message, undefined, { status });
    }
}

function timeoutError(index: number): TranscriptionTemporaryError {
    return new TranscriptionTemporaryError('OpenRouter chunk transcription timed out', undefined, {
        index,
        reason: 'timeout',
    });
}

function usageOf(raw: unknown): TranscriptionUsage | null {
    const parsed = usageSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { seconds: parsed.data.seconds ?? 0, cost: parsed.data.cost ?? 0 };
}

function toWords(items: readonly unknown[]): ChunkWord[] {
    const words: ChunkWord[] = [];
    for (const item of items) {
        const parsed = wordSchema.safeParse(item);
        if (!parsed.success) continue;
        const word = parsed.data;
        if (word.type != null && word.type !== 'word') continue;
        const text = (word.word ?? word.text ?? '').trim();
        if (text === '' || word.start == null || word.end == null) continue;
        if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0) continue;
        words.push({
            text,
            start: word.start,
            end: Math.max(word.start, word.end),
            speaker: speakerOf(word.speaker ?? word.speaker_id ?? word.speaker_label),
        });
    }
    return words;
}

/** `0`, `"0"` and `"speaker_0"` are the same label. */
function speakerOf(value: number | string | null | undefined): string {
    if (value == null) return UNKNOWN_SPEAKER;
    const raw = String(value).trim();
    if (raw === '') return UNKNOWN_SPEAKER;
    return SPEAKER_PREFIX.exec(raw)?.[1] ?? raw;
}
