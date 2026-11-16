import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { silentLogger } from '../../../../files/application/test-doubles';
import { recordingLogger } from '../../../application/test-doubles';
import {
    TranscriptionPermanentError,
    TranscriptionTemporaryError,
    TranscriptionTimeoutError,
} from '../../domain/errors';
import type { PreparedMeetingAudio } from '../../domain/ports/meeting-audio-preparer.port';
import { WholeFileStt, type WholeFileSttSettings } from './whole-file-stt';

const API_KEY = 'sk-or-test-secret-key';
const AUDIO = Buffer.from('OggS-fake-opus-whole-file');
const SECRET_TEXT = 'confidential-meeting-phrase';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function settings(overrides: Partial<WholeFileSttSettings> = {}): WholeFileSttSettings {
    return {
        apiKey: API_KEY,
        baseUrl: 'https://openrouter.test/api/v1/',
        model: 'elevenlabs/scribe-v2',
        language: undefined,
        timeoutMs: 240_000,
        maxAudioBytes: 1_000_000,
        ...overrides,
    };
}

const okBody = {
    language: 'rus',
    text: SECRET_TEXT,
    words: [
        { word: 'Привет', start: 0.1, end: 0.5, speaker: 'speaker_0' },
        { text: SECRET_TEXT, start: 0.6, end: 1.2, speaker_id: 'speaker_1', type: 'word' },
    ],
    usage: { seconds: 3500, cost: 0.42 },
};

function sentJson(fetchMock: FetchMock): Record<string, unknown> {
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('fetch was not called with a JSON string');
    return z.record(z.string(), z.unknown()).parse(JSON.parse(body));
}

function abortReasonOf(signal: AbortSignal | null | undefined): Error {
    const reason: unknown = signal?.reason;
    return reason instanceof Error ? reason : new DOMException('aborted', 'AbortError');
}

function permanentReasonOf(error: Error): string | null {
    return error instanceof TranscriptionPermanentError ? error.reason : null;
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

describe('WholeFileStt', () => {
    let fetchMock: FetchMock;
    let workDir: string;
    let audio: PreparedMeetingAudio;
    const signal = (): AbortSignal => new AbortController().signal;

    beforeEach(async () => {
        fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetchMock);
        workDir = await mkdtemp(join(tmpdir(), 'whole-file-stt-'));
        const path = join(workDir, 'meeting.ogg');
        await writeFile(path, AUDIO);
        audio = { path, durationSec: 3600, sizeBytes: AUDIO.length };
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        await rm(workDir, { recursive: true, force: true });
    });

    describe('request', () => {
        it('posts one JSON request to /audio/transcriptions with the whole file', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));

            await new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal());

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] ?? [];
            expect(url).toBe('https://openrouter.test/api/v1/audio/transcriptions');
            expect(init?.method).toBe('POST');
            const headers = new Headers(init?.headers);
            expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
            expect(headers.get('content-type')).toContain('application/json');
            expect(init).not.toHaveProperty('dispatcher');

            const json = sentJson(fetchMock);
            expect(json).toEqual({
                model: 'elevenlabs/scribe-v2',
                input_audio: { data: AUDIO.toString('base64'), format: 'ogg' },
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
                diarize: true,
            });
        });

        it('sends language only when a language is configured', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            await new WholeFileStt(settings({ language: 'ru' }), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(sentJson(fetchMock).language).toBe('ru');
        });

        it('passes a signal that follows the caller abort', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            const controller = new AbortController();
            await new WholeFileStt(settings(), silentLogger()).transcribe(audio, controller.signal);

            const sent = fetchMock.mock.calls[0]?.[1]?.signal;
            expect(sent?.aborted).toBe(false);
            controller.abort();
            expect(sent?.aborted).toBe(true);
        });
    });

    describe('response', () => {
        it('returns language, words and usage with provider cost', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );

            expect(result.language).toBe('rus');
            expect(result.words).toEqual([
                { type: 'word', text: 'Привет', start: 0.1, end: 0.5, speakerId: '0' },
                { type: 'word', text: SECRET_TEXT, start: 0.6, end: 1.2, speakerId: '1' },
            ]);
            expect(result.usage).toEqual({ seconds: 3500, cost: 0.42 });
        });

        it('falls back to the audio duration and null cost when usage is missing', async () => {
            fetchMock.mockResolvedValue(Response.json({ words: [] }));
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(result.language).toBeNull();
            expect(result.usage).toEqual({ seconds: 3600, cost: null });
        });

        it.each([
            [0, '0'],
            ['0', '0'],
            ['speaker_0', '0'],
            ['speaker_12', '12'],
            ['Speaker 3', 'Speaker 3'],
            ['  ', null],
        ])('reads speaker label %j as %j', async (label, expected) => {
            fetchMock.mockResolvedValue(
                Response.json({ words: [{ word: 'a', start: 0, end: 1, speaker_label: label }] }),
            );
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(result.words[0]?.speakerId).toBe(expected);
        });

        it('skips a blank speaker field and reads the next filled one', async () => {
            fetchMock.mockResolvedValue(
                Response.json({
                    words: [{ word: 'a', start: 0, end: 1, speaker: ' ', speaker_id: 'speaker_2' }],
                }),
            );
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(result.words[0]?.speakerId).toBe('2');
        });

        it('keeps invalid word fields as null for the converter to drop', async () => {
            fetchMock.mockResolvedValue(Response.json({ words: [{ word: 'x' }] }));
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(result.words[0]).toEqual({
                type: 'word',
                text: 'x',
                start: null,
                end: null,
                speakerId: null,
            });
        });

        it('keeps non-word item types so the converter can skip them', async () => {
            fetchMock.mockResolvedValue(
                Response.json({
                    words: [{ text: ' ', type: 'spacing', start: 0, end: 1, speaker_id: 'a' }],
                }),
            );
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(result.words[0]?.type).toBe('spacing');
        });

        it.each([
            ['no words array', { language: 'rus' }],
            ['words is not an array', { language: 'rus', words: 'nope' }],
            ['body is not an object', 'oops'],
        ])('rejects an invalid response structure (%s) as temporary', async (_name, body) => {
            fetchMock.mockResolvedValue(Response.json(body));
            const error = await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });

        it('rejects a non-JSON response as temporary', async () => {
            fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
            const error = await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });
    });

    describe('errors', () => {
        it.each([429, 500, 502, 503, 504])('maps HTTP %i to a temporary error', async (code) => {
            fetchMock.mockResolvedValue(new Response('busy', { status: code }));
            const error = await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it.each([415, 422])('maps HTTP %i to a permanent unsupported-media error', async (code) => {
            fetchMock.mockResolvedValue(new Response('bad', { status: code }));
            const error = await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(permanentReasonOf(error)).toBe('unsupported-media');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('maps HTTP 400 to a temporary error logged as error, since the file is already validated', async () => {
            const log = recordingLogger();
            fetchMock.mockResolvedValue(new Response('bad model', { status: 400 }));
            const error = await rejectionOf(
                new WholeFileStt(settings(), log.logger).transcribe(audio, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
            expect(log.error).toHaveBeenCalled();
        });

        it('releases the body of a failed response', async () => {
            const response = new Response('busy', { status: 503 });
            const cancel = vi.spyOn(response.body ?? new ReadableStream(), 'cancel');
            fetchMock.mockResolvedValue(response);
            await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(cancel).toHaveBeenCalled();
        });

        it.each([401, 403])(
            'maps HTTP %i to a temporary config error logged as error',
            async (code) => {
                fetchMock.mockResolvedValue(new Response('no', { status: code }));
                const log = recordingLogger();
                const error = await rejectionOf(
                    new WholeFileStt(settings(), log.logger).transcribe(audio, signal()),
                );
                expect(error).toBeInstanceOf(TranscriptionTemporaryError);
                expect(log.error).toHaveBeenCalled();
                expect(log.dump()).not.toContain(API_KEY);
            },
        );

        it('maps HTTP 413 to a permanent too-long error', async () => {
            fetchMock.mockResolvedValue(new Response('big', { status: 413 }));
            const error = await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(permanentReasonOf(error)).toBe('too-long');
        });

        it('maps a network failure to a temporary error', async () => {
            fetchMock.mockRejectedValue(new TypeError('fetch failed'));
            const error = await rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });

        it('fails with a temporary error without calling the provider when the key is missing', async () => {
            const log = recordingLogger();
            const error = await rejectionOf(
                new WholeFileStt(settings({ apiKey: undefined }), log.logger).transcribe(
                    audio,
                    signal(),
                ),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(log.error).toHaveBeenCalled();
            expect(log.dump()).not.toContain(API_KEY);
        });

        it('refuses a file over the size limit before sending, with no fallback', async () => {
            const error = await rejectionOf(
                new WholeFileStt(
                    settings({ maxAudioBytes: AUDIO.length - 1 }),
                    silentLogger(),
                ).transcribe(audio, signal()),
            );
            expect(permanentReasonOf(error)).toBe('too-long');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('timeout and cancellation', () => {
        it('turns the HTTP timeout into a timeout error', async () => {
            fetchMock.mockImplementation(
                (_url, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(abortReasonOf(init.signal));
                        });
                    }),
            );
            const error = await rejectionOf(
                new WholeFileStt(settings({ timeoutMs: 20 }), silentLogger()).transcribe(
                    audio,
                    signal(),
                ),
            );
            expect(error).toBeInstanceOf(TranscriptionTimeoutError);
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });

        it('rethrows the abort error when the caller cancels', async () => {
            const controller = new AbortController();
            fetchMock.mockImplementation(
                (_url, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(abortReasonOf(init.signal));
                        });
                    }),
            );
            const pending = rejectionOf(
                new WholeFileStt(settings(), silentLogger()).transcribe(audio, controller.signal),
            );
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalled();
            });
            controller.abort(new Error('job cancelled'));
            const error = await pending;
            expect(error).not.toBeInstanceOf(TranscriptionTemporaryError);
            expect(error.message).toBe('job cancelled');
        });
    });

    describe('logging', () => {
        it('never logs the key, the transcript text or provider messages', async () => {
            const log = recordingLogger();
            fetchMock.mockResolvedValueOnce(Response.json(okBody));
            await new WholeFileStt(settings(), log.logger).transcribe(audio, signal());
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify({ detail: { message: SECRET_TEXT } }), { status: 500 }),
            );
            await rejectionOf(new WholeFileStt(settings(), log.logger).transcribe(audio, signal()));
            fetchMock.mockResolvedValueOnce(new Response('x', { status: 401 }));
            await rejectionOf(new WholeFileStt(settings(), log.logger).transcribe(audio, signal()));

            const dump = log.dump();
            expect(dump).not.toContain(API_KEY);
            expect(dump).not.toContain(SECRET_TEXT);
        });
    });
});
