import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Env } from '../../../../shared/config/env.schema';
import { TranscriptionProviderError } from '../../domain/errors';
import { VoiceClip } from '../../domain/voice-clip';
import {
    NO_SPEECH_MARKER,
    Transcriber,
    TRANSCRIPTION_PROMPT,
    type TranscriberSettings,
} from './transcriber';

const API_KEY = 'sk-or-test-secret-key';
const MODEL = 'google/gemini-3.1-flash-lite';
const AUDIO = Buffer.from('OggS-fake-opus-payload');

const SETTINGS: TranscriberSettings = {
    apiKey: API_KEY,
    baseUrl: 'https://openrouter.test/api/v1/',
    model: MODEL,
};

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function clip(mimeType = 'audio/ogg'): VoiceClip {
    return VoiceClip.of({ audio: AUDIO, mimeType, durationSec: 20 });
}

function completion(content: unknown): Response {
    return Response.json({ choices: [{ message: { role: 'assistant', content } }] });
}

const sentBodySchema = z.object({
    model: z.string(),
    temperature: z.number(),
    messages: z.array(
        z.object({ role: z.string(), content: z.array(z.record(z.string(), z.unknown())) }),
    ),
});

interface SentRequest {
    url: string;
    init: RequestInit;
    body: z.infer<typeof sentBodySchema>;
}

function sentRequest(fetchMock: FetchMock): SentRequest {
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    if (typeof url !== 'string' || typeof init?.body !== 'string') {
        throw new Error('fetch was not called with a JSON body');
    }
    return { url, init, body: sentBodySchema.parse(JSON.parse(init.body)) };
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error: unknown) {
        if (error instanceof Error) return error;
        throw new Error('Rejected with a non-error', { cause: error });
    }
    throw new Error('Expected the promise to reject');
}

describe('Transcriber', () => {
    let fetchMock: FetchMock;

    beforeEach(() => {
        fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends the audio as input_audio to chat/completions of OpenRouter', async () => {
        fetchMock.mockResolvedValue(completion('Позвонить клиенту завтра'));
        const signal = new AbortController().signal;

        await new Transcriber(SETTINGS).transcribe(clip(), signal);

        const { url, init, body } = sentRequest(fetchMock);
        expect(url).toBe('https://openrouter.test/api/v1/chat/completions');
        expect(init.method).toBe('POST');
        expect(init.signal).toBe(signal);
        expect(init.headers).toMatchObject({
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
        });
        expect(body.model).toBe(MODEL);
        expect(body.temperature).toBe(0);
        expect(body.messages).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: TRANSCRIPTION_PROMPT },
                    {
                        type: 'input_audio',
                        input_audio: { data: AUDIO.toString('base64'), format: 'ogg' },
                    },
                ],
            },
        ]);
    });

    it('sends ogg as is: the spike showed the model accepts Telegram ogg/opus', async () => {
        fetchMock.mockResolvedValue(completion('текст'));

        await new Transcriber(SETTINGS).transcribe(
            clip('audio/ogg; codecs=opus'),
            new AbortController().signal,
        );

        const audio = sentRequest(fetchMock).body.messages[0]?.content[1];
        expect(audio).toMatchObject({ input_audio: { format: 'ogg' } });
    });

    it('sends the provider format of other supported clips', async () => {
        fetchMock.mockResolvedValue(completion('текст'));

        await new Transcriber(SETTINGS).transcribe(
            clip('audio/mpeg'),
            new AbortController().signal,
        );

        const audio = sentRequest(fetchMock).body.messages[0]?.content[1];
        expect(audio).toMatchObject({ input_audio: { format: 'mp3' } });
    });

    it('asks for a verbatim transcript and for the marker when there is no speech', () => {
        expect(TRANSCRIPTION_PROMPT).toContain('дословно');
        expect(TRANSCRIPTION_PROMPT).toContain('без комментариев');
        expect(TRANSCRIPTION_PROMPT).toContain(NO_SPEECH_MARKER);
    });

    it('returns the trimmed transcript', async () => {
        fetchMock.mockResolvedValue(completion('  Поставь Ивану задачу  \n'));

        const result = await new Transcriber(SETTINGS).transcribe(
            clip(),
            new AbortController().signal,
        );

        expect(result).toEqual({ kind: 'text', text: 'Поставь Ивану задачу' });
    });

    it('joins the text parts when the content is an array', async () => {
        fetchMock.mockResolvedValue(
            completion([
                { type: 'text', text: 'Поставь ' },
                { type: 'text', text: 'задачу' },
            ]),
        );

        const result = await new Transcriber(SETTINGS).transcribe(
            clip(),
            new AbortController().signal,
        );

        expect(result).toEqual({ kind: 'text', text: 'Поставь задачу' });
    });

    it.each([
        ['an empty answer', ''],
        ['a blank answer', '  \n '],
        ['a null content', null],
        ['the marker', NO_SPEECH_MARKER],
        ['the marker with punctuation', ` «${NO_SPEECH_MARKER}». `],
        ['a bracketed service note', '[тишина]'],
        ['a service phrase', 'В записи нет речи.'],
        ['another service phrase', 'Речь не распознана'],
        ['an English service phrase', '(no speech)'],
    ])('returns no-speech for %s', async (_, content) => {
        fetchMock.mockResolvedValue(completion(content));

        const result = await new Transcriber(SETTINGS).transcribe(
            clip(),
            new AbortController().signal,
        );

        expect(result).toEqual({ kind: 'no-speech' });
    });

    it('keeps a real sentence that mentions silence', async () => {
        fetchMock.mockResolvedValue(completion('В записи нет речи о сроках, уточни дедлайн'));

        const result = await new Transcriber(SETTINGS).transcribe(
            clip(),
            new AbortController().signal,
        );

        expect(result.kind).toBe('text');
    });

    it('throws a provider error with the status on an HTTP error, without the key', async () => {
        fetchMock.mockResolvedValue(
            Response.json({ error: { code: 503, message: 'upstream down' } }, { status: 503 }),
        );

        const error = await rejectionOf(
            new Transcriber(SETTINGS).transcribe(clip(), new AbortController().signal),
        );

        expect(error).toBeInstanceOf(TranscriptionProviderError);
        expect((error as TranscriptionProviderError).metadata).toMatchObject({ status: 503 });
        expect(JSON.stringify(error)).not.toContain(API_KEY);
        expect(error.message).not.toContain(API_KEY);
    });

    it('throws a provider error when OpenRouter answers 200 with an error body', async () => {
        fetchMock.mockResolvedValue(Response.json({ error: { code: 400, message: 'bad audio' } }));

        await expect(
            new Transcriber(SETTINGS).transcribe(clip(), new AbortController().signal),
        ).rejects.toBeInstanceOf(TranscriptionProviderError);
    });

    it('throws a provider error when the answer has no choices', async () => {
        fetchMock.mockResolvedValue(Response.json({ id: 'gen-1' }));

        await expect(
            new Transcriber(SETTINGS).transcribe(clip(), new AbortController().signal),
        ).rejects.toBeInstanceOf(TranscriptionProviderError);
    });

    it('throws a provider error when the network fails', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'));

        await expect(
            new Transcriber(SETTINGS).transcribe(clip(), new AbortController().signal),
        ).rejects.toBeInstanceOf(TranscriptionProviderError);
    });

    it('stops when the signal is aborted', async () => {
        fetchMock.mockImplementation(
            (_url, init) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('This operation was aborted', 'AbortError'));
                    });
                }),
        );
        const controller = new AbortController();

        const pending = new Transcriber(SETTINGS).transcribe(clip(), controller.signal);
        controller.abort();

        await expect(pending).rejects.toBeInstanceOf(Error);
    });

    it('does not call OpenRouter without an api key', async () => {
        const transcriber = new Transcriber({ ...SETTINGS, apiKey: undefined });

        await expect(
            transcriber.transcribe(clip(), new AbortController().signal),
        ).rejects.toBeInstanceOf(TranscriptionProviderError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('takes the key, the base url and the model from env', () => {
        const config = new ConfigService<Env, true>({
            OPENROUTER_API_KEY: API_KEY,
            OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
            TRANSCRIPTION_MODEL: 'google/other-audio-model',
        });

        const settings = Transcriber.settingsFromConfig(config);

        expect(settings).toEqual({
            apiKey: API_KEY,
            baseUrl: 'https://openrouter.test/api/v1',
            model: 'google/other-audio-model',
        });
    });
});
