import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioChunk } from '../domain/audio-chunk';
import type { ChunkWord } from '../domain/chunk-word';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../domain/errors';
import {
    AudioChunkerPort,
    type ChunkPlan,
    EXEMPLAR_GAP_SEC,
    type RenderedAudioChunk,
    type SpeakerExemplar,
} from '../domain/ports/audio-chunker.port';
import {
    ChunkTranscriberPort,
    type ChunkTranscription,
} from '../domain/ports/chunk-transcriber.port';
import type { MeetingAudio } from '../domain/ports/meeting-transcriber.port';
import { run } from '../testing/word-builders';
import {
    ChunkedMeetingTranscriber,
    type ChunkedMeetingTranscriberSettings,
} from './chunked-meeting-transcriber';

const AUDIO = Buffer.from('fake-recording-bytes');

class FakeChunker extends AudioChunkerPort {
    durationSec = 900;
    probeError: Error | null = null;
    readonly inputs: string[] = [];
    readonly workDirs: string[] = [];
    readonly rendered: { chunk: ChunkPlan; exemplars: SpeakerExemplar[] }[] = [];
    readonly signals: AbortSignal[] = [];
    readonly events: string[];

    constructor(events: string[]) {
        super();
        this.events = events;
    }

    async probe(inputPath: string): Promise<{ durationSec: number }> {
        this.inputs.push(await readFile(inputPath, 'utf8'));
        if (this.probeError) throw this.probeError;
        return { durationSec: this.durationSec };
    }

    async render(
        _inputPath: string,
        chunk: ChunkPlan,
        exemplars: readonly SpeakerExemplar[],
        workDir: string,
        signal: AbortSignal,
    ): Promise<RenderedAudioChunk> {
        this.signals.push(signal);
        this.events.push(`render:${String(chunk.index)}`);
        this.workDirs.push(workDir);
        this.rendered.push({ chunk, exemplars: [...exemplars] });
        let offset = 0;
        const exemplarLayout = exemplars.map((e) => {
            const placement = {
                globalSpeakerId: e.globalSpeakerId,
                startInFileSec: offset,
                endInFileSec: offset + (e.endSec - e.startSec),
            };
            offset = placement.endInFileSec + EXEMPLAR_GAP_SEC;
            return placement;
        });
        const path = join(workDir, `chunk-${String(chunk.index)}.ogg`);
        await writeFile(path, 'chunk');
        return { ...chunk, path, sizeBytes: 100, prefixSec: offset, exemplarLayout };
    }
}

type Answer = (chunk: AudioChunk) => Promise<ChunkTranscription>;

class FakeProvider extends ChunkTranscriberPort {
    readonly calls: number[] = [];
    readonly signals: AbortSignal[] = [];
    readonly events: string[];

    constructor(
        events: string[],
        private readonly answer: Answer,
    ) {
        super();
        this.events = events;
    }

    async transcribe(chunk: AudioChunk, signal: AbortSignal): Promise<ChunkTranscription> {
        this.signals.push(signal);
        this.events.push(`transcribe:${String(chunk.index)}:start`);
        this.calls.push(chunk.index);
        const result = await this.answer(chunk);
        this.events.push(`transcribe:${String(chunk.index)}:end`);
        return result;
    }
}

function isRendered(chunk: AudioChunk): chunk is RenderedAudioChunk {
    return 'exemplarLayout' in chunk && 'prefixSec' in chunk;
}

function rendered(chunk: AudioChunk): RenderedAudioChunk {
    if (!isRendered(chunk)) throw new Error('Expected a rendered chunk');
    return chunk;
}

/** Words of the exemplar part of a rendered file; `labels[i]` is the label of exemplar `i`. */
function inPrefix(chunk: AudioChunk, ...labels: string[]): ChunkWord[] {
    return rendered(chunk).exemplarLayout.flatMap((p, i) =>
        run(labels[Math.min(i, labels.length - 1)], p.startInFileSec, p.endInFileSec - 0.1),
    );
}

/** Words of the recording part, `from`/`to` relative to the chunk start. */
function inMain(chunk: AudioChunk, label: string, from: number, to: number): ChunkWord[] {
    const { prefixSec } = rendered(chunk);
    return run(label, prefixSec + from, prefixSec + to);
}

/** One speaker: talks 0–8 s in each chunk; recognised by the exemplar after the first chunk. */
const oneSpeaker: Answer = (chunk) =>
    Promise.resolve({
        language: chunk.index === 0 ? 'ru' : null,
        words: [...inPrefix(chunk, 'A'), ...inMain(chunk, 'A', 0, 8)],
        usage: null,
    });

describe('ChunkedMeetingTranscriber', () => {
    let tmpRoot: string;
    let events: string[];
    let chunker: FakeChunker;

    const settings = (): ChunkedMeetingTranscriberSettings => ({
        chunkSec: 600,
        overlapSec: 30,
        maxExemplars: 8,
        exemplarSec: 10,
        tmpRoot,
    });

    const make = (
        answer: Answer,
    ): { provider: FakeProvider; transcriber: ChunkedMeetingTranscriber } => {
        const provider = new FakeProvider(events, answer);
        return {
            provider,
            transcriber: new ChunkedMeetingTranscriber(chunker, provider, settings()),
        };
    };

    const audio = (): MeetingAudio => ({
        stream: Readable.from([AUDIO]),
        contentType: 'audio/mp4',
        sizeBytes: AUDIO.length,
    });

    beforeEach(async () => {
        tmpRoot = await mkdtemp(join(tmpdir(), 'chunked-transcriber-spec-'));
        events = [];
        chunker = new FakeChunker(events);
    });

    afterEach(async () => {
        await rm(tmpRoot, { recursive: true, force: true });
    });

    describe('temporary folder', () => {
        it('writes the stream into a temporary folder and removes it after success', async () => {
            const { transcriber } = make(oneSpeaker);

            await transcriber.transcribe(audio(), new AbortController().signal);

            expect(chunker.inputs).toEqual([AUDIO.toString('utf8')]);
            expect(chunker.workDirs.length).toBeGreaterThan(0);
            expect(chunker.workDirs.every((d) => d.startsWith(tmpRoot))).toBe(true);
            expect(new Set(chunker.workDirs).size).toBe(1);
            expect(await readdir(tmpRoot)).toEqual([]);
        });

        it('removes each chunk file once the provider has answered', async () => {
            const leftovers: boolean[] = [];
            const { transcriber } = make((chunk) => {
                if (chunk.index > 0) {
                    leftovers.push(
                        existsSync(
                            join(chunker.workDirs[0], `chunk-${String(chunk.index - 1)}.ogg`),
                        ),
                    );
                }
                return oneSpeaker(chunk);
            });

            await transcriber.transcribe(audio(), new AbortController().signal);

            expect(leftovers.length).toBeGreaterThan(0);
            expect(leftovers.every((exists) => !exists)).toBe(true);
        });

        it('destroys the recording stream when the temporary folder cannot be created', async () => {
            const recording = audio();

            await expect(
                new ChunkedMeetingTranscriber(chunker, new FakeProvider(events, oneSpeaker), {
                    ...settings(),
                    tmpRoot: join(tmpRoot, 'missing', 'nested'),
                }).transcribe(recording, new AbortController().signal),
            ).rejects.toThrow();
            expect(recording.stream.destroyed).toBe(true);
        });

        it('removes stale work folders on start and keeps fresh ones', async () => {
            const stale = join(tmpRoot, 'meeting-transcription-stale');
            const fresh = join(tmpRoot, 'meeting-transcription-fresh');
            const foreign = join(tmpRoot, 'other-stale');
            for (const dir of [stale, fresh, foreign]) await mkdir(dir);
            const longAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            await utimes(stale, longAgo, longAgo);
            await utimes(foreign, longAgo, longAgo);

            await make(oneSpeaker).transcriber.onModuleInit();

            expect((await readdir(tmpRoot)).sort()).toEqual([
                'meeting-transcription-fresh',
                'other-stale',
            ]);
        });

        it('removes the folder when a chunk fails', async () => {
            const { transcriber } = make(() =>
                Promise.reject(new TranscriptionPermanentError('unsupported-media')),
            );

            await expect(
                transcriber.transcribe(audio(), new AbortController().signal),
            ).rejects.toBeInstanceOf(TranscriptionPermanentError);
            expect(await readdir(tmpRoot)).toEqual([]);
        });

        it('removes the folder when probe fails', async () => {
            chunker.probeError = new TranscriptionPermanentError('too-long');
            const { transcriber } = make(oneSpeaker);

            await expect(
                transcriber.transcribe(audio(), new AbortController().signal),
            ).rejects.toMatchObject({ reason: 'too-long' });
            expect(await readdir(tmpRoot)).toEqual([]);
        });

        it('turns a broken input stream into a temporary error and cleans up', async () => {
            const broken = new Readable({
                read() {
                    this.destroy(new Error('connection reset'));
                },
            });
            const { transcriber } = make(oneSpeaker);

            await expect(
                transcriber.transcribe(
                    { stream: broken, contentType: 'audio/mp4', sizeBytes: 10 },
                    new AbortController().signal,
                ),
            ).rejects.toBeInstanceOf(TranscriptionTemporaryError);
            expect(chunker.rendered).toEqual([]);
            expect(await readdir(tmpRoot)).toEqual([]);
        });
    });

    describe('chunk order', () => {
        it('processes chunks strictly one after another', async () => {
            chunker.durationSec = 1500; // 3 chunks
            const pending: (() => void)[] = [];
            const { transcriber, provider } = make(
                (chunk) =>
                    new Promise((resolve) => {
                        pending.push(() => {
                            void oneSpeaker(chunk).then(resolve);
                        });
                    }),
            );

            const done = transcriber.transcribe(audio(), new AbortController().signal);
            for (let i = 0; i < 3; i++) {
                await expect.poll(() => pending.length).toBe(i + 1);
                // the next chunk waits for the answer to this one
                await new Promise((r) => setTimeout(r, 10));
                expect(provider.calls).toEqual(Array.from({ length: i + 1 }, (_, k) => k));
                pending[i]();
            }
            await done;

            expect(events).toEqual([
                'render:0',
                'transcribe:0:start',
                'transcribe:0:end',
                'render:1',
                'transcribe:1:start',
                'transcribe:1:end',
                'render:2',
                'transcribe:2:start',
                'transcribe:2:end',
            ]);
            expect(chunker.rendered.map((r) => r.chunk)).toEqual([
                { index: 0, startSec: 0, endSec: 600 },
                { index: 1, startSec: 570, endSec: 1170 },
                { index: 2, startSec: 1140, endSec: 1500 },
            ]);
        });
    });

    describe('exemplars', () => {
        it('renders the first chunk without exemplars and the next ones with registry exemplars', async () => {
            const { transcriber } = make(oneSpeaker);

            await transcriber.transcribe(audio(), new AbortController().signal);

            expect(chunker.rendered[0].exemplars).toEqual([]);
            // speaker-1 talked 0–8 s in the first chunk: the whole run is the exemplar
            expect(chunker.rendered[1].exemplars).toEqual([
                { globalSpeakerId: 'speaker-1', startSec: 0, endSec: 7.9 },
            ]);
        });

        it('passes the signal to the chunker and the provider', async () => {
            const controller = new AbortController();
            const { transcriber, provider } = make(oneSpeaker);

            await transcriber.transcribe(audio(), controller.signal);

            const seen = [...chunker.signals, ...provider.signals];
            expect(seen.length).toBe(4);
            expect(seen.every((s) => s === controller.signal)).toBe(true);
        });
    });

    describe('result', () => {
        it('merges chunks with TranscriptMerger', async () => {
            const { transcriber } = make((chunk) =>
                Promise.resolve({
                    language: chunk.index === 0 ? 'ru' : 'en',
                    words:
                        chunk.index === 0
                            ? [...inMain(chunk, 'A', 0, 8), ...inMain(chunk, 'B', 100, 106)]
                            : [...inPrefix(chunk, 'X', 'Y'), ...inMain(chunk, 'X', 100, 105)],
                    usage: null,
                }),
            );

            const { transcript: result } = await transcriber.transcribe(
                audio(),
                new AbortController().signal,
            );

            expect(result.language).toBe('ru');
            expect(result.durationSec).toBe(900);
            expect(result.segments.map((s) => s.speaker)).toEqual([1, 2, 1]);
            expect(result.segments[0].startSec).toBe(0);
            expect(result.segments[1].startSec).toBe(100);
            // the second chunk starts at 570 s
            expect(result.segments[2].startSec).toBe(670);
        });

        it('gives an empty transcript when nobody speaks', async () => {
            const { transcriber } = make(() =>
                Promise.resolve({ language: null, words: [], usage: null }),
            );

            const { transcript: result, usage } = await transcriber.transcribe(
                audio(),
                new AbortController().signal,
            );

            expect(result.segments).toEqual([]);
            expect(result.language).toBeNull();
            expect(usage).toEqual({ seconds: 0, cost: 0 });
            expect(chunker.rendered.every((r) => r.exemplars.length === 0)).toBe(true);
        });

        it('sums the usage of all chunks, skipping chunks without it', async () => {
            chunker.durationSec = 1500; // 3 chunks
            const billed = [{ seconds: 600, cost: 0.04 }, null, { seconds: 330, cost: 0.02 }];
            const { transcriber } = make((chunk) =>
                Promise.resolve({
                    language: null,
                    words: [],
                    usage: billed[chunk.index] ?? null,
                }),
            );

            const { usage } = await transcriber.transcribe(audio(), new AbortController().signal);

            expect(usage.seconds).toBe(930);
            expect(usage.cost).toBeCloseTo(0.06);
        });
    });

    describe('errors', () => {
        it('stops on a permanent chunk error and rethrows it', async () => {
            chunker.durationSec = 1500;
            const error = new TranscriptionPermanentError('unsupported-media');
            const { transcriber, provider } = make((chunk) =>
                chunk.index === 1 ? Promise.reject(error) : oneSpeaker(chunk),
            );

            await expect(
                transcriber.transcribe(audio(), new AbortController().signal),
            ).rejects.toBe(error);
            expect(provider.calls).toEqual([0, 1]);
            expect(chunker.rendered.map((r) => r.chunk.index)).toEqual([0, 1]);
        });

        it('rethrows a temporary error after the provider retries as temporary', async () => {
            const error = new TranscriptionTemporaryError('Chunk transcription is unavailable');
            const { transcriber, provider } = make(() => Promise.reject(error));

            await expect(
                transcriber.transcribe(audio(), new AbortController().signal),
            ).rejects.toBe(error);
            expect(provider.calls).toEqual([0]);
        });
    });
});
