import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Env } from '../../../../../shared/config/env.schema';
import { silentLogger } from '../../../../files/application/test-doubles';
import { recordingLogger } from '../../../application/test-doubles';
import type { AudioChunk } from '../../domain/audio-chunk';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../../domain/errors';
import { ChunkTranscriber, type ChunkTranscriberSettings } from './chunk-transcriber';

const API_KEY = 'sk-or-test-secret-key';
const MODEL = 'elevenlabs/scribe-v2';
const AUDIO = Buffer.from('OggS-fake-opus-chunk');
const FIXTURES = join(__dirname, '../../testing/fixtures');

const sampleSchema = z.object({
    words: z.array(
        z.object({ word: z.string(), start: z.number(), end: z.number(), speaker: z.number() }),
    ),
});
const chunkResponseSchema = z.object({ response: z.unknown() });
const scenarioSchema = z.object({ chunks: z.tuple([chunkResponseSchema, chunkResponseSchema]) });
const syntheticSchema = z.object({
    sharedWordsInOverlap: scenarioSchema,
    pauseInOverlap: scenarioSchema,
});

function fixture(name: string): unknown {
    return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

const sampleRaw = fixture('scribe-response-sample.json');
const sample = sampleSchema.parse(sampleRaw);
const synthetic = syntheticSchema.parse(fixture('synthetic-chunks.json'));

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const sentBodySchema = z.object({
    model: z.string(),
    input_audio: z.object({ data: z.string(), format: z.string() }),
    response_format: z.string(),
    timestamp_granularities: z.array(z.string()),
    diarize: z.boolean(),
    language: z.string().optional(),
});

function settings(overrides: Partial<ChunkTranscriberSettings> = {}): ChunkTranscriberSettings {
    return {
        apiKey: API_KEY,
        baseUrl: 'https://openrouter.test/api/v1/',
        model: MODEL,
        language: undefined,
        timeoutMs: 90_000,
        retryDelayMs: 0,
        ...overrides,
    };
}

function sentRequest(
    fetchMock: FetchMock,
    call = 0,
): { url: string; init: RequestInit; body: z.infer<typeof sentBodySchema> } {
    const [url, init] = fetchMock.mock.calls[call] ?? [];
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

function status(code: number): Response {
    return Response.json({ error: { message: 'provider said no', code } }, { status: code });
}

describe('ChunkTranscriber', () => {
    let fetchMock: FetchMock;
    let workDir: string;
    let chunk: AudioChunk;
    const signal = (): AbortSignal => new AbortController().signal;

    beforeEach(async () => {
        fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetchMock);
        workDir = await mkdtemp(join(tmpdir(), 'chunk-transcriber-'));
        const path = join(workDir, 'chunk-0.ogg');
        await writeFile(path, AUDIO);
        chunk = { index: 0, path, startSec: 0, endSec: 600, sizeBytes: AUDIO.length };
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
        await rm(workDir, { recursive: true, force: true });
    });

    describe('request', () => {
        it('posts base64 ogg with verbose_json and diarize to audio/transcriptions', async () => {
            fetchMock.mockResolvedValue(Response.json(sampleRaw));
            await new ChunkTranscriber(settings(), silentLogger()).transcribe(chunk, signal());

            const { url, init, body } = sentRequest(fetchMock);
            expect(url).toBe('https://openrouter.test/api/v1/audio/transcriptions');
            expect(init.method).toBe('POST');
            expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${API_KEY}`);
            expect(body).toEqual({
                model: MODEL,
                input_audio: { data: AUDIO.toString('base64'), format: 'ogg' },
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
                diarize: true,
            });
            expect(body).not.toHaveProperty('language');
        });

        it('sends language only when it is configured', async () => {
            fetchMock.mockResolvedValue(Response.json(sampleRaw));
            await new ChunkTranscriber(settings({ language: 'ru' }), silentLogger()).transcribe(
                chunk,
                signal(),
            );
            expect(sentRequest(fetchMock).body.language).toBe('ru');
        });

        it('takes model, language and timeout from env', () => {
            const values: Partial<Env> = {
                OPENROUTER_API_KEY: API_KEY,
                OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
                MEETING_TRANSCRIPTION_MODEL: MODEL,
                MEETING_TRANSCRIPTION_LANGUAGE: 'ru',
                MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS: 90_000,
            };
            const config = new ConfigService<Env, true>(values);
            expect(ChunkTranscriber.settingsFromConfig(config)).toMatchObject({
                apiKey: API_KEY,
                baseUrl: 'https://openrouter.ai/api/v1',
                model: MODEL,
                language: 'ru',
                timeoutMs: 90_000,
            });
        });
    });

    describe('response', () => {
        it('maps provider words to ChunkWord, dropping blank words', async () => {
            fetchMock.mockResolvedValue(Response.json(sampleRaw));
            const result = await new ChunkTranscriber(settings(), silentLogger()).transcribe(
                chunk,
                signal(),
            );

            const expected = sample.words
                .filter((word) => word.word.trim() !== '')
                .map((word) => ({
                    text: word.word,
                    start: word.start,
                    end: word.end,
                    speaker: String(word.speaker),
                }));
            expect(result.language).toBe('rus');
            expect(result.words).toEqual(expected);
            expect(result.words.length).toBeLessThan(sample.words.length);
        });

        it('accepts text/speaker_id and speaker_label variants with the same labels', async () => {
            const [first, second] = synthetic.sharedWordsInOverlap.chunks;
            fetchMock
                .mockResolvedValueOnce(Response.json(first.response))
                .mockResolvedValueOnce(Response.json(second.response));
            const transcriber = new ChunkTranscriber(settings(), silentLogger());

            const left = await transcriber.transcribe(chunk, signal());
            const right = await transcriber.transcribe(chunk, signal());

            expect(left.words.map((w) => w.text)).toEqual([
                'альфа',
                'бета',
                'гамма',
                'дельта',
                'общий1',
                'общий2',
                'общий3',
                'общий4',
            ]);
            expect(right.words.map((w) => [w.text, w.speaker])).toEqual([
                ['общий1', '1'],
                ['общий2', '1'],
                ['общий3', '1'],
                ['общий4', '0'],
                ['эпсилон', '0'],
                ['дзета', '1'],
            ]);
            expect(new Set(left.words.map((w) => w.speaker))).toEqual(new Set(['0', '1']));
        });

        it('reads speaker_label when speaker is missing', async () => {
            const [first] = synthetic.pauseInOverlap.chunks;
            fetchMock.mockResolvedValue(Response.json(first.response));
            const result = await new ChunkTranscriber(settings(), silentLogger()).transcribe(
                chunk,
                signal(),
            );
            expect(result.words).toEqual([
                { text: 'один', start: 2, end: 2.4, speaker: '0' },
                { text: 'два', start: 10, end: 10.4, speaker: '1' },
                { text: 'три', start: 45, end: 45.5, speaker: '0' },
            ]);
        });

        it('returns an empty list when the provider found no words', async () => {
            fetchMock
                .mockResolvedValueOnce(Response.json({ text: '', language: 'rus', words: [] }))
                .mockResolvedValueOnce(Response.json({ text: '' }));
            const transcriber = new ChunkTranscriber(settings(), silentLogger());

            expect(await transcriber.transcribe(chunk, signal())).toEqual({
                language: 'rus',
                words: [],
                usage: null,
            });
            expect(await transcriber.transcribe(chunk, signal())).toEqual({
                language: null,
                words: [],
                usage: null,
            });
        });

        it('returns the seconds and cost the provider billed for the chunk', async () => {
            fetchMock.mockResolvedValue(Response.json(sampleRaw));

            const result = await new ChunkTranscriber(settings(), silentLogger()).transcribe(
                chunk,
                signal(),
            );

            expect(result.usage).toEqual({ seconds: 300, cost: 0.01833333333333 });
        });

        it.each([
            ['without cost', { seconds: 60 }, { seconds: 60, cost: 0 }],
            ['without seconds', { cost: 0.5 }, { seconds: 0, cost: 0.5 }],
            ['malformed', { seconds: 'many' }, null],
            ['empty', {}, null],
        ])('reads usage %s', async (_case, usage, expected) => {
            fetchMock.mockResolvedValue(Response.json({ language: 'rus', words: [], usage }));

            const result = await new ChunkTranscriber(settings(), silentLogger()).transcribe(
                chunk,
                signal(),
            );

            expect(result.usage).toEqual(expected);
        });
    });

    describe('status codes', () => {
        it.each([429, 500, 502, 503, 401, 403])('treats HTTP %i as temporary', async (code) => {
            fetchMock.mockImplementation(() => Promise.resolve(status(code)));
            const error = await rejectionOf(
                new ChunkTranscriber(settings(), silentLogger()).transcribe(chunk, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });

        it.each([400, 413, 422])('treats HTTP %i as permanent without retries', async (code) => {
            fetchMock.mockImplementation(() => Promise.resolve(status(code)));
            const error = await rejectionOf(
                new ChunkTranscriber(settings(), silentLogger()).transcribe(chunk, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionPermanentError);
            expect(error).toMatchObject({ reason: 'unsupported-media' });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('treats a network failure as temporary', async () => {
            fetchMock.mockRejectedValue(new TypeError('fetch failed'));
            const error = await rejectionOf(
                new ChunkTranscriber(settings(), silentLogger()).transcribe(chunk, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });

        it('treats an unreadable body as temporary', async () => {
            fetchMock.mockImplementation(() =>
                Promise.resolve(new Response('<html>oops</html>', { status: 200 })),
            );
            const error = await rejectionOf(
                new ChunkTranscriber(settings(), silentLogger()).transcribe(chunk, signal()),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
        });

        it('fails as temporary without a request when the API key is missing', async () => {
            const error = await rejectionOf(
                new ChunkTranscriber(settings({ apiKey: undefined }), silentLogger()).transcribe(
                    chunk,
                    signal(),
                ),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('timeout', () => {
        it('aborts the request after the timeout and reports a temporary error', async () => {
            const signals: AbortSignal[] = [];
            fetchMock.mockImplementation((_url, init) => {
                const requestSignal = init?.signal;
                if (!requestSignal) throw new Error('no signal');
                signals.push(requestSignal);
                return new Promise<Response>((_resolve, reject) => {
                    requestSignal.addEventListener('abort', () => {
                        reject(
                            requestSignal.reason instanceof Error
                                ? requestSignal.reason
                                : new Error('aborted'),
                        );
                    });
                });
            });
            const error = await rejectionOf(
                new ChunkTranscriber(settings({ timeoutMs: 20 }), silentLogger()).transcribe(
                    chunk,
                    signal(),
                ),
            );
            expect(error).toBeInstanceOf(TranscriptionTemporaryError);
            expect(signals.length).toBeGreaterThan(0);
            expect(signals.every((s) => s.aborted)).toBe(true);
        });

        it('uses 90 seconds by default via AbortSignal.timeout', async () => {
            const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
            fetchMock.mockResolvedValue(Response.json(sampleRaw));
            const config = new ConfigService<Env, true>({
                OPENROUTER_API_KEY: API_KEY,
                OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
                MEETING_TRANSCRIPTION_MODEL: MODEL,
                MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS: 90_000,
            } satisfies Partial<Env>);
            await new ChunkTranscriber(
                ChunkTranscriber.settingsFromConfig(config),
                silentLogger(),
            ).transcribe(chunk, signal());
            expect(timeoutSpy).toHaveBeenCalledWith(90_000);
        });

        it('stops without retries when the caller aborts', async () => {
            const controller = new AbortController();
            fetchMock.mockImplementation((_url, init) => {
                controller.abort(new Error('shutdown'));
                const reason: unknown = init?.signal?.reason;
                return Promise.reject(reason instanceof Error ? reason : new Error('aborted'));
            });
            const error = await rejectionOf(
                new ChunkTranscriber(settings(), silentLogger()).transcribe(
                    chunk,
                    controller.signal,
                ),
            );
            expect(error).not.toBeInstanceOf(TranscriptionTemporaryError);
            expect(error).not.toBeInstanceOf(TranscriptionPermanentError);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('retries', () => {
        it('retries a temporary failure up to 2 times', async () => {
            fetchMock.mockImplementation(() => Promise.resolve(status(503)));
            await rejectionOf(
                new ChunkTranscriber(settings(), silentLogger()).transcribe(chunk, signal()),
            );
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('returns the result when a retry succeeds', async () => {
            fetchMock
                .mockResolvedValueOnce(status(429))
                .mockRejectedValueOnce(new TypeError('fetch failed'))
                .mockResolvedValueOnce(Response.json(sampleRaw));
            const result = await new ChunkTranscriber(settings(), silentLogger()).transcribe(
                chunk,
                signal(),
            );
            expect(result.words.length).toBeGreaterThan(0);
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
    });

    describe('logging', () => {
        it('never logs words, the API key or the audio', async () => {
            const log = recordingLogger();
            fetchMock
                .mockResolvedValueOnce(status(401))
                .mockResolvedValueOnce(status(500))
                .mockResolvedValueOnce(Response.json(sampleRaw));
            await new ChunkTranscriber(settings(), log.logger).transcribe(chunk, signal());

            const logged = log.dump();
            expect(log.error).toHaveBeenCalledWith(
                { chunkIndex: chunk.index, status: 401 },
                'OpenRouter refused the API key',
            );
            expect(log.warn).toHaveBeenCalledWith(
                expect.objectContaining({ chunkIndex: chunk.index, retry: 1 }),
                'Chunk transcription failed temporarily',
            );
            for (const word of sample.words.filter((w) => w.word.trim() !== '')) {
                expect(logged).not.toContain(`"${word.word}"`);
            }
            expect(logged).not.toContain(API_KEY);
            expect(logged).not.toContain(AUDIO.toString('base64'));
            expect(logged).not.toContain('provider said no');
            expect(logged).not.toContain(chunk.path);
        });
    });
});
