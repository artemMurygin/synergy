import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../../../../shared/config/env.schema';
import { TranscriptionProviderError } from '../../domain/errors';
import { TranscriberPort } from '../../domain/ports/transcriber.port';
import { TranscriptionResult } from '../../domain/transcription-result';
import type { VoiceClip } from '../../domain/voice-clip';

/** What the model answers when the clip holds no speech. */
export const NO_SPEECH_MARKER = 'NO_SPEECH';

// Without the marker sentence the model answers "Привет, как дела?" for pure silence (spike 1.2).
export const TRANSCRIPTION_PROMPT =
    'Транскрибируй это голосовое сообщение дословно, на языке оригинала. ' +
    'Верни только текст расшифровки, без комментариев, пояснений и markdown-оформления. ' +
    `Если в записи нет разборчивой речи (тишина, шум, музыка), верни ровно ${NO_SPEECH_MARKER} ` +
    'и ничего больше. Не придумывай текст.';

/** Whole answers that are a note of the model about the clip, not a transcript. */
const SERVICE_PHRASES: readonly RegExp[] = [
    /^no[\s_-]?speech$/i,
    /^(в записи )?(нет|отсутствует) (разборчивой |распознаваемой )?речи$/i,
    /^речь (не распознана|отсутствует|неразборчива)$/i,
    /^(тишина|шум|музыка|неразборчиво|silence|noise|music|inaudible)$/i,
];

const EDGE_NOISE = /^[\s"'«»“”„.,!?…:;()[\]{}*_-]+|[\s"'«»“”„.,!?…:;()[\]{}*_-]+$/g;

const TRAILING_SLASHES = /\/+$/;

const responseSchema = z.object({
    error: z.object({ code: z.union([z.number(), z.string()]).optional() }).optional(),
    choices: z
        .array(
            z.object({
                message: z.object({
                    content: z
                        .union([z.string(), z.array(z.object({ text: z.string().optional() }))])
                        .nullish(),
                }),
            }),
        )
        .optional(),
});

export interface TranscriberSettings {
    readonly apiKey: string | undefined;
    readonly baseUrl: string;
    readonly model: string;
}

/**
 * Sends the clip to `POST {OPENROUTER_BASE_URL}/chat/completions` as `input_audio`, as the
 * benchmark in `bench/` does. Telegram ogg/opus goes as is: the model accepts it without ffmpeg.
 */
export class Transcriber extends TranscriberPort {
    constructor(private readonly settings: TranscriberSettings) {
        super();
    }

    static settingsFromConfig(config: ConfigService<Env, true>): TranscriberSettings {
        return {
            apiKey: config.get('OPENROUTER_API_KEY', { infer: true }),
            baseUrl: config.get('OPENROUTER_BASE_URL', { infer: true }),
            model: config.get('TRANSCRIPTION_MODEL', { infer: true }),
        };
    }

    async transcribe(clip: VoiceClip, signal: AbortSignal): Promise<TranscriptionResult> {
        const { apiKey } = this.settings;
        if (apiKey === undefined || apiKey === '') {
            throw new TranscriptionProviderError(
                'OPENROUTER_API_KEY is not configured',
                undefined,
                {
                    reason: 'not_configured',
                },
            );
        }
        const format = clip.format;
        if (format === null) {
            throw new TranscriptionProviderError('Voice clip format is not supported', undefined, {
                reason: 'unsupported_format',
            });
        }

        const response = await this.post(apiKey, clip.audio.toString('base64'), format, signal);
        const parsed = responseSchema.safeParse(await readJson(response));
        if (!response.ok || !parsed.success || parsed.data.error !== undefined) {
            throw new TranscriptionProviderError(
                `OpenRouter transcription failed with HTTP ${String(response.status)}`,
                undefined,
                {
                    status: response.status,
                    providerCode: parsed.success ? parsed.data.error?.code : undefined,
                },
            );
        }
        const choice = parsed.data.choices?.[0];
        if (choice === undefined) {
            throw new TranscriptionProviderError('OpenRouter returned no choices', undefined, {
                status: response.status,
                reason: 'invalid_response',
            });
        }
        return toResult(choice.message.content);
    }

    private async post(
        apiKey: string,
        data: string,
        format: string,
        signal: AbortSignal,
    ): Promise<Response> {
        const baseUrl = this.settings.baseUrl.replace(TRAILING_SLASHES, '');
        try {
            return await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                signal,
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.settings.model,
                    temperature: 0,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: TRANSCRIPTION_PROMPT },
                                { type: 'input_audio', input_audio: { data, format } },
                            ],
                        },
                    ],
                }),
            });
        } catch (error: unknown) {
            if (signal.aborted) throw error;
            const cause = error instanceof Error ? error : undefined;
            throw new TranscriptionProviderError('OpenRouter request failed', cause, {
                reason: cause?.name ?? 'unknown',
            });
        }
    }
}

type Content = string | { text?: string }[] | null | undefined;

function toResult(content: Content): TranscriptionResult {
    const raw =
        typeof content === 'string'
            ? content
            : (content ?? []).map((part) => part.text ?? '').join('');
    const text = raw.trim();
    if (isNoSpeech(text)) return TranscriptionResult.noSpeech();
    return TranscriptionResult.text(text);
}

function isNoSpeech(text: string): boolean {
    const core = text.replace(EDGE_NOISE, '');
    if (core.length === 0) return true;
    return SERVICE_PHRASES.some((phrase) => phrase.test(core));
}

async function readJson(response: Response): Promise<unknown> {
    try {
        const body: unknown = await response.json();
        return body;
    } catch {
        return undefined;
    }
}
