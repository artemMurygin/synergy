import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../../shared/config/env.schema';
import { readFile } from 'node:fs/promises';
import type { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../../domain/errors';
import type { PreparedMeetingAudio } from '../../domain/ports/meeting-audio-preparer.port';
import {
    WholeFileSttPort,
    type WholeFileTranscription,
    type WholeFileWord,
} from '../../domain/ports/whole-file-stt.port';

const PERMANENT_STATUSES = new Set([400, 415, 422]);
const AUTH_STATUSES = new Set([401, 403]);
const TRAILING_SLASHES = /\/+$/;

const finiteOrNull = z.number().nullish().catch(null);
const stringOrNull = z.string().nullish().catch(null);
const labelOrNull = z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => (value === undefined || value === null ? null : String(value)))
    .catch(null);

const wordSchema = z.object({
    type: stringOrNull,
    word: stringOrNull,
    text: stringOrNull,
    start: finiteOrNull,
    end: finiteOrNull,
    speaker: labelOrNull,
    speaker_id: labelOrNull,
    speaker_label: labelOrNull,
});

const responseSchema = z.object({
    language: z.string().nullish().catch(null),
    language_code: z.string().nullish().catch(null),
    words: z.array(z.unknown()),
    usage: z
        .object({
            seconds: z.number().nullish().catch(null),
            cost: z.number().nullish().catch(null),
        })
        .nullish()
        .catch(null),
});

export interface WholeFileSttSettings {
    /** Секрет OpenRouter; не логируется. */
    readonly apiKey: string | undefined;
    readonly baseUrl: string;
    readonly model: string;
    readonly language: string | undefined;
    /** Таймаут одного HTTP-запроса на всю запись. */
    readonly timeoutMs: number;
    /** Предельный размер сжатого файла; проверяется до отправки. */
    readonly maxAudioBytes: number;
}

/**
 * Один запрос `POST {baseUrl}/audio/transcriptions` (OpenRouter, диаризация, слова) на всю запись.
 * Файл уходит одним JSON с base64 в `input_audio`, без нарезки. Повторы - на уровне job.
 * В логах только статус и причина: ни ключа, ни текста, ни сообщений провайдера.
 */
export class WholeFileStt extends WholeFileSttPort {
    constructor(
        private readonly settings: WholeFileSttSettings,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(WholeFileStt.name);
    }

    static settingsFromConfig(config: ConfigService<Env, true>): WholeFileSttSettings {
        return {
            apiKey: config.get('OPENROUTER_API_KEY', { infer: true }),
            baseUrl: config.get('OPENROUTER_BASE_URL', { infer: true }),
            model: config.get('MEETING_TRANSCRIPTION_MODEL', { infer: true }),
            language: config.get('MEETING_TRANSCRIPTION_LANGUAGE', { infer: true }),
            timeoutMs: config.get('MEETING_TRANSCRIPTION_STT_TIMEOUT_MS', { infer: true }),
            maxAudioBytes: config.get('MEETING_TRANSCRIPTION_MAX_AUDIO_BYTES', { infer: true }),
        };
    }

    async transcribe(
        audio: PreparedMeetingAudio,
        signal: AbortSignal,
    ): Promise<WholeFileTranscription> {
        const { apiKey } = this.settings;
        if (apiKey === undefined || apiKey === '') {
            this.logger.error({ reason: 'not_configured' }, 'OpenRouter API key is not configured');
            throw new TranscriptionTemporaryError(
                'OpenRouter API key is not configured',
                undefined,
                { reason: 'not_configured' },
            );
        }
        if (audio.sizeBytes > this.settings.maxAudioBytes) {
            this.logger.warn(
                { sizeBytes: audio.sizeBytes, maxAudioBytes: this.settings.maxAudioBytes },
                'Prepared audio exceeds the size limit',
            );
            throw new TranscriptionPermanentError(
                'too-long',
                'Prepared audio exceeds the size limit',
                undefined,
                { sizeBytes: audio.sizeBytes, maxAudioBytes: this.settings.maxAudioBytes },
            );
        }

        const body = await this.requestBody(audio);
        const timeout = AbortSignal.timeout(this.settings.timeoutMs);
        const baseUrl = this.settings.baseUrl.replace(TRAILING_SLASHES, '');
        let response: Response;
        try {
            response = await fetch(`${baseUrl}/audio/transcriptions`, {
                method: 'POST',
                signal: AbortSignal.any([signal, timeout]),
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body,
            });
        } catch (error: unknown) {
            throw this.requestError(error, signal, timeout);
        }

        if (!response.ok) throw this.statusError(response.status);

        let json: unknown;
        try {
            json = await response.json();
        } catch (error: unknown) {
            if (signal.aborted) throw error;
            if (timeout.aborted) throw this.timeoutError();
        }
        const parsed = responseSchema.safeParse(json);
        if (!parsed.success) {
            this.logger.warn({ status: response.status }, 'Invalid whole-file STT response');
            throw new TranscriptionTemporaryError(
                'OpenRouter returned an invalid response',
                undefined,
                { status: response.status, reason: 'invalid_response' },
            );
        }
        const { data } = parsed;
        return {
            language: data.language ?? data.language_code ?? null,
            words: data.words.map(toWord),
            usage: {
                seconds: data.usage?.seconds ?? audio.durationSec,
                cost: data.usage?.cost ?? null,
            },
        };
    }

    private async requestBody(audio: PreparedMeetingAudio): Promise<string> {
        const data = (await readFile(audio.path)).toString('base64');
        const { language } = this.settings;
        return JSON.stringify({
            model: this.settings.model,
            input_audio: { data, format: 'ogg' },
            response_format: 'verbose_json',
            timestamp_granularities: ['word'],
            diarize: true,
            ...(language !== undefined && language !== '' ? { language } : {}),
        });
    }

    private requestError(error: unknown, signal: AbortSignal, timeout: AbortSignal): unknown {
        if (signal.aborted) return error;
        if (timeout.aborted) return this.timeoutError();
        const cause = error instanceof Error ? error : undefined;
        this.logger.warn({ errorName: cause?.name ?? 'unknown' }, 'Whole-file STT request failed');
        return new TranscriptionTemporaryError('OpenRouter request failed', cause, {
            reason: cause?.name ?? 'unknown',
        });
    }

    private timeoutError(): TranscriptionTemporaryError {
        this.logger.warn(
            { timeoutMs: this.settings.timeoutMs },
            'Whole-file STT request timed out',
        );
        return new TranscriptionTemporaryError('OpenRouter transcription timed out', undefined, {
            reason: 'timeout',
        });
    }

    private statusError(status: number): Error {
        const message = `OpenRouter transcription failed with HTTP ${String(status)}`;
        if (status === 413) {
            this.logger.warn({ status }, 'Provider refused the recording as too large');
            return new TranscriptionPermanentError('too-long', message, undefined, { status });
        }
        if (PERMANENT_STATUSES.has(status)) {
            this.logger.warn({ status }, 'Provider rejected the recording');
            return new TranscriptionPermanentError('unsupported-media', message, undefined, {
                status,
            });
        }
        if (AUTH_STATUSES.has(status)) {
            this.logger.error({ status }, 'OpenRouter refused the API key');
        } else {
            this.logger.warn({ status }, 'Whole-file STT request failed');
        }
        return new TranscriptionTemporaryError(message, undefined, { status });
    }
}

function toWord(item: unknown): WholeFileWord {
    const parsed = wordSchema.safeParse(item);
    if (!parsed.success) {
        return { type: null, text: null, start: null, end: null, speakerId: null };
    }
    const word = parsed.data;
    return {
        type: word.type ?? 'word',
        text: word.word ?? word.text ?? null,
        start: word.start ?? null,
        end: word.end ?? null,
        speakerId: word.speaker ?? word.speaker_id ?? word.speaker_label ?? null,
    };
}
