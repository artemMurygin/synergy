import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../../shared/config/env.schema';
import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import type { PinoLogger } from 'nestjs-pino';
import { Agent } from 'undici';
import { z } from 'zod';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../../domain/errors';
import type { PreparedMeetingAudio } from '../../domain/ports/meeting-audio-preparer.port';
import {
    WholeFileSttPort,
    type WholeFileTranscription,
    type WholeFileWord,
} from '../../domain/ports/whole-file-stt.port';

const PERMANENT_STATUSES = new Set([400, 413, 415, 422]);
const AUTH_STATUSES = new Set([401, 403]);
const TRAILING_SLASHES = /\/+$/;

const finiteOrNull = z.number().nullish().catch(null);
const stringOrNull = z.string().nullish().catch(null);

const wordSchema = z.object({
    type: stringOrNull,
    text: stringOrNull,
    start: finiteOrNull,
    end: finiteOrNull,
    speaker_id: stringOrNull,
});

const responseSchema = z.object({
    language_code: z.string().nullish().catch(null),
    words: z.array(z.unknown()),
});

export interface WholeFileSttSettings {
    /** Секрет ElevenLabs; не логируется. */
    readonly apiKey: string | undefined;
    readonly baseUrl: string;
    readonly model: string;
    readonly language: string | undefined;
    /** Таймаут одного HTTP-запроса на всю запись. */
    readonly timeoutMs: number;
    /** Предельный размер сжатого файла; проверяется до отправки. */
    readonly maxFileBytes: number;
}

/**
 * Один запрос `POST {baseUrl}/v1/speech-to-text` (ElevenLabs `scribe_v2`, диаризация, слова)
 * на всю запись. Файл уходит как multipart `file` с диска без base64 и без нарезки. Повторы —
 * на уровне job. В логах только статус и причина: ни ключа, ни текста, ни сообщений провайдера.
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
            apiKey: config.get('ELEVENLABS_API_KEY', { infer: true }),
            baseUrl: config.get('ELEVENLABS_BASE_URL', { infer: true }),
            model: config.get('ELEVENLABS_STT_MODEL', { infer: true }),
            language: config.get('MEETING_TRANSCRIPTION_LANGUAGE', { infer: true }),
            timeoutMs: config.get('MEETING_TRANSCRIPTION_STT_TIMEOUT_MS', { infer: true }),
            maxFileBytes: config.get('MEETING_TRANSCRIPTION_MAX_FILE_BYTES', { infer: true }),
        };
    }

    private agent: Agent | undefined;

    private dispatcher(): Agent {
        this.agent ??= new Agent({
            headersTimeout: this.settings.timeoutMs,
            bodyTimeout: this.settings.timeoutMs,
        });
        return this.agent;
    }

    async transcribe(
        audio: PreparedMeetingAudio,
        signal: AbortSignal,
    ): Promise<WholeFileTranscription> {
        const { apiKey } = this.settings;
        if (apiKey === undefined || apiKey === '') {
            this.logger.error({ reason: 'not_configured' }, 'ElevenLabs API key is not configured');
            throw new TranscriptionTemporaryError(
                'ElevenLabs API key is not configured',
                undefined,
                { reason: 'not_configured' },
            );
        }
        if (audio.sizeBytes > this.settings.maxFileBytes) {
            this.logger.warn(
                { sizeBytes: audio.sizeBytes, maxFileBytes: this.settings.maxFileBytes },
                'Prepared audio exceeds the size limit',
            );
            throw new TranscriptionPermanentError(
                'too-long',
                'Prepared audio exceeds the size limit',
                undefined,
                { sizeBytes: audio.sizeBytes, maxFileBytes: this.settings.maxFileBytes },
            );
        }

        const body = await this.form(audio);
        const timeout = AbortSignal.timeout(this.settings.timeoutMs);
        const baseUrl = this.settings.baseUrl.replace(TRAILING_SLASHES, '');
        let response: Response;
        try {
            response = await fetch(`${baseUrl}/v1/speech-to-text`, {
                method: 'POST',
                signal: AbortSignal.any([signal, timeout]),
                headers: { 'xi-api-key': apiKey },
                body,
                // Дефолтные headersTimeout/bodyTimeout undici (300 с) короче обработки длинной записи.
                dispatcher: this.dispatcher(),
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
                'ElevenLabs returned an invalid response',
                undefined,
                { status: response.status, reason: 'invalid_response' },
            );
        }
        return {
            language: parsed.data.language_code ?? null,
            words: parsed.data.words.map(toWord),
            usage: { seconds: audio.durationSec, cost: null },
        };
    }

    private async form(audio: PreparedMeetingAudio): Promise<FormData> {
        const form = new FormData();
        form.append('model_id', this.settings.model);
        form.append('diarize', 'true');
        form.append('timestamps_granularity', 'word');
        const { language } = this.settings;
        if (language !== undefined && language !== '') form.append('language_code', language);
        form.append(
            'file',
            await openAsBlob(audio.path, { type: 'audio/ogg' }),
            basename(audio.path),
        );
        return form;
    }

    private requestError(error: unknown, signal: AbortSignal, timeout: AbortSignal): unknown {
        if (signal.aborted) return error;
        if (timeout.aborted) return this.timeoutError();
        const cause = error instanceof Error ? error : undefined;
        this.logger.warn({ errorName: cause?.name ?? 'unknown' }, 'Whole-file STT request failed');
        return new TranscriptionTemporaryError('ElevenLabs request failed', cause, {
            reason: cause?.name ?? 'unknown',
        });
    }

    private timeoutError(): TranscriptionTemporaryError {
        this.logger.warn(
            { timeoutMs: this.settings.timeoutMs },
            'Whole-file STT request timed out',
        );
        return new TranscriptionTemporaryError('ElevenLabs transcription timed out', undefined, {
            reason: 'timeout',
        });
    }

    private statusError(status: number): Error {
        const message = `ElevenLabs transcription failed with HTTP ${String(status)}`;
        if (PERMANENT_STATUSES.has(status)) {
            this.logger.warn({ status }, 'Provider rejected the recording');
            return new TranscriptionPermanentError('unsupported-media', message, undefined, {
                status,
            });
        }
        if (AUTH_STATUSES.has(status)) {
            this.logger.error({ status }, 'ElevenLabs refused the API key');
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
        type: word.type ?? null,
        text: word.text ?? null,
        start: word.start ?? null,
        end: word.end ?? null,
        speakerId: word.speaker_id ?? null,
    };
}
