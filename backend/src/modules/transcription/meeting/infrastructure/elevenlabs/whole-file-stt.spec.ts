import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../../../../files/application/test-doubles';
import { recordingLogger } from '../../../application/test-doubles';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../../domain/errors';
import type { PreparedMeetingAudio } from '../../domain/ports/meeting-audio-preparer.port';
import { WholeFileStt, type WholeFileSttSettings } from './whole-file-stt';

const API_KEY = 'xi-test-secret-key';
const AUDIO = Buffer.from('OggS-fake-opus-whole-file');
const SECRET_TEXT = 'confidential-meeting-phrase';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function settings(overrides: Partial<WholeFileSttSettings> = {}): WholeFileSttSettings {
    return {
        apiKey: API_KEY,
        baseUrl: 'https://elevenlabs.test/',
        model: 'scribe_v2',
        language: undefined,
        timeoutMs: 600_000,
        maxFileBytes: 1_000_000,
        ...overrides,
    };
}

const okBody = {
    language_code: 'rus',
    language_probability: 0.99,
    text: SECRET_TEXT,
    words: [
        { text: 'Привет', start: 0.1, end: 0.5, type: 'word', speaker_id: 'speaker_0' },
        { text: ' ', start: 0.5, end: 0.6, type: 'spacing', speaker_id: 'speaker_0' },
        { text: SECRET_TEXT, start: 0.6, end: 1.2, type: 'word', speaker_id: 'speaker_1' },
    ],
};

function sentForm(fetchMock: FetchMock): FormData {
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData)) throw new Error('fetch was not called with FormData');
    return body;
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
        it('posts one multipart request to /v1/speech-to-text with the whole file', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            await new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal());

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] ?? [];
            expect(url).toBe('https://elevenlabs.test/v1/speech-to-text');
            expect(init?.method).toBe('POST');
            expect(new Headers(init?.headers).get('xi-api-key')).toBe(API_KEY);

            const form = sentForm(fetchMock);
            expect(form.get('model_id')).toBe('scribe_v2');
            expect(form.get('diarize')).toBe('true');
            expect(form.get('timestamps_granularity')).toBe('word');
            expect(form.has('language_code')).toBe(false);
            expect([...form.keys()].filter((key) => key === 'file')).toHaveLength(1);
        });

        it('sends the file as a blob, not as base64 text', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            await new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal());

            const file = sentForm(fetchMock).get('file');
            expect(file).toBeInstanceOf(Blob);
            const blob = file as Blob;
            expect(blob.size).toBe(AUDIO.length);
            expect(Buffer.from(await blob.arrayBuffer()).equals(AUDIO)).toBe(true);
            expect(typeof fetchMock.mock.calls[0]?.[1]?.body).not.toBe('string');
        });

        it('sends language_code only when a language is configured', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            await new WholeFileStt(settings({ language: 'ru' }), silentLogger()).transcribe(
                audio,
                signal(),
            );
            expect(sentForm(fetchMock).get('language_code')).toBe('ru');
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
        it('returns language, words and usage in seconds with unknown cost', async () => {
            fetchMock.mockResolvedValue(Response.json(okBody));
            const result = await new WholeFileStt(settings(), silentLogger()).transcribe(
                audio,
                signal(),
            );

            expect(result.language).toBe('rus');
            expect(result.words).toHaveLength(3);
            expect(result.words[0]).toEqual({
                type: 'word',
                text: 'Привет',
                start: 0.1,
                end: 0.5,
                speakerId: 'speaker_0',
            });
            expect(result.usage).toEqual({ seconds: 3600, cost: null });
        });

        it('keeps invalid word fields as null for the converter to drop', async () => {
            fetchMock.mockResolvedValue(
                Response.json({ language_code: 'rus', words: [{ text: 'x', type: 'word' }] }),
            );
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

        it.each([
            ['no words array', { language_code: 'rus' }],
            ['words is not an array', { language_code: 'rus', words: 'nope' }],
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

        it.each([400, 413, 415, 422])(
            'maps HTTP %i to a permanent unsupported-media error',
            async (code) => {
                fetchMock.mockResolvedValue(new Response('bad', { status: code }));
                const error = await rejectionOf(
                    new WholeFileStt(settings(), silentLogger()).transcribe(audio, signal()),
                );
                expect(error).toBeInstanceOf(TranscriptionPermanentError);
                expect((error as TranscriptionPermanentError).reason).toBe('unsupported-media');
                expect(fetchMock).toHaveBeenCalledTimes(1);
            },
        );

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
        });

        it('refuses a file over the size limit before sending, with no fallback', async () => {
            const error = await rejectionOf(
                new WholeFileStt(
                    settings({ maxFileBytes: AUDIO.length - 1 }),
                    silentLogger(),
                ).transcribe(audio, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionPermanentError);
            expect((error as TranscriptionPermanentError).reason).toBe('too-long');
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('timeout and cancellation', () => {
        it('turns the HTTP timeout into a temporary error', async () => {
            fetchMock.mockImplementation(
                (_url, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(init.signal?.reason as Error);
                        });
                    }),
            );
            const error = await rejectionOf(
                new WholeFileStt(settings({ timeoutMs: 20 }), silentLogger()).transcribe(
                    audio,
                    signal(),
                ),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
            expect((error as TranscriptionTemporaryError).metadata).toMatchObject({
                reason: 'timeout',
            });
        });

        it('rethrows the abort error when the caller cancels', async () => {
            const controller = new AbortController();
            fetchMock.mockImplementation(
                (_url, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(init.signal?.reason as Error);
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
