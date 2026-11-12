import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { silentLogger } from '../../../../files/application/test-doubles';
import { TranscriptionPermanentError } from '../../domain/errors';
import { AudioChunker } from './audio-chunker';

const hasFfmpeg =
    spawnSync('ffmpeg', ['-version']).status === 0 &&
    spawnSync('ffprobe', ['-version']).status === 0;

const MAX_DURATION_SEC = 120;
const MAX_CHUNK_BYTES = 20 * 1024 * 1024;
const TOLERANCE_SEC = 0.1;

function ffmpeg(args: string[]): void {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
    if (result.status !== 0) {
        throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
    }
}

const probeJsonSchema = z.object({
    format: z.object({ duration: z.string(), format_name: z.string() }),
    streams: z.array(
        z.object({
            codec_type: z.string(),
            codec_name: z.string(),
            sample_rate: z.string().optional(),
            channels: z.number().optional(),
        }),
    ),
});

interface ProbeInfo {
    duration: number;
    streams: { codec_type: string; codec_name: string; sample_rate?: string; channels?: number }[];
    formatName: string;
}

function probe(path: string): ProbeInfo {
    const result = spawnSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration,format_name:stream=codec_type,codec_name,sample_rate,channels',
        '-of',
        'json',
        path,
    ]);
    const json = probeJsonSchema.parse(JSON.parse(result.stdout.toString()));
    return {
        duration: Number(json.format.duration),
        streams: json.streams,
        formatName: json.format.format_name,
    };
}

function sine(path: string, durationSec: number, frequency = 440): void {
    ffmpeg([
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${String(frequency)}:duration=${String(durationSec)}:sample_rate=44100`,
        '-ac',
        '2',
        path,
    ]);
}

describe.skipIf(!hasFfmpeg)('AudioChunker (ffmpeg integration)', () => {
    let dir: string;
    let wav: string;
    let longWav: string;
    const chunker = new AudioChunker(
        {
            maxDurationSec: MAX_DURATION_SEC,
            maxChunkBytes: MAX_CHUNK_BYTES,
        },
        { logger: silentLogger() },
    );

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'ffmpeg-chunker-'));
        wav = join(dir, 'input.wav');
        sine(wav, 60);
        longWav = join(dir, 'long.wav');
        sine(longWav, MAX_DURATION_SEC + 10);
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    describe('probe', () => {
        it('returns the duration', async () => {
            const result = await chunker.probe(wav, new AbortController().signal);
            expect(result.durationSec).toBeCloseTo(60, 1);
        });

        it('throws too-long when the recording is longer than the maximum', async () => {
            const error = await chunker
                .probe(longWav, new AbortController().signal)
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TranscriptionPermanentError);
            expect(error).toMatchObject({ reason: 'too-long' });
        });

        it('throws unsupported-media for a broken file', async () => {
            const broken = join(dir, 'broken.mp3');
            await writeFile(broken, Buffer.from('definitely not audio'.repeat(100)));
            const error = await chunker
                .probe(broken, new AbortController().signal)
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TranscriptionPermanentError);
            expect(error).toMatchObject({ reason: 'unsupported-media' });
        });

        it('throws unsupported-media for a file without audio', async () => {
            const silentVideo = join(dir, 'video-only.mp4');
            ffmpeg([
                '-f',
                'lavfi',
                '-i',
                'testsrc=size=64x48:rate=5:duration=2',
                '-c:v',
                'mpeg4',
                silentVideo,
            ]);
            const error = await chunker
                .probe(silentVideo, new AbortController().signal)
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TranscriptionPermanentError);
            expect(error).toMatchObject({ reason: 'unsupported-media' });
        });
    });

    describe('render', () => {
        it('renders [start, end) as ogg/opus mono 16 kHz without exemplars', async () => {
            const workDir = await mkdtemp(join(dir, 'work-'));
            const chunk = await chunker.render(
                wav,
                { index: 0, startSec: 10, endSec: 40 },
                [],
                workDir,
                new AbortController().signal,
            );

            expect(chunk.index).toBe(0);
            expect(chunk.startSec).toBe(10);
            expect(chunk.endSec).toBe(40);
            expect(chunk.prefixSec).toBe(0);
            expect(chunk.exemplarLayout).toEqual([]);
            expect(chunk.path.startsWith(workDir)).toBe(true);
            expect(chunk.sizeBytes).toBe((await stat(chunk.path)).size);
            expect(chunk.sizeBytes).toBeGreaterThan(0);
            expect(chunk.sizeBytes).toBeLessThan(MAX_CHUNK_BYTES);

            const info = probe(chunk.path);
            expect(info.formatName).toBe('ogg');
            expect(info.streams).toHaveLength(1);
            expect(info.streams[0]).toMatchObject({ codec_type: 'audio', codec_name: 'opus' });
            expect(info.streams[0].channels).toBe(1);
            expect(Math.abs(info.duration - 30)).toBeLessThan(TOLERANCE_SEC);
        });

        it('puts two exemplars with 1 s of silence after each before the chunk', async () => {
            const workDir = await mkdtemp(join(dir, 'work-'));
            const chunk = await chunker.render(
                wav,
                { index: 2, startSec: 30, endSec: 50 },
                [
                    { globalSpeakerId: 'A', startSec: 2, endSec: 7 },
                    { globalSpeakerId: 'B', startSec: 12, endSec: 15.5 },
                ],
                workDir,
                new AbortController().signal,
            );

            expect(chunk.prefixSec).toBeCloseTo(5 + 1 + 3.5 + 1, 6);
            expect(chunk.exemplarLayout).toEqual([
                { globalSpeakerId: 'A', startInFileSec: 0, endInFileSec: 5 },
                { globalSpeakerId: 'B', startInFileSec: 6, endInFileSec: 9.5 },
            ]);

            const info = probe(chunk.path);
            expect(Math.abs(info.duration - (chunk.prefixSec + 20))).toBeLessThan(TOLERANCE_SEC);
        });

        it('keeps only the audio of a video file', async () => {
            const mp4 = join(dir, 'video.mp4');
            ffmpeg([
                '-f',
                'lavfi',
                '-i',
                'testsrc=size=64x48:rate=5:duration=6',
                '-f',
                'lavfi',
                '-i',
                'sine=frequency=300:duration=6',
                '-c:v',
                'mpeg4',
                '-c:a',
                'aac',
                '-shortest',
                mp4,
            ]);
            const workDir = await mkdtemp(join(dir, 'work-'));
            const chunk = await chunker.render(
                mp4,
                { index: 0, startSec: 0, endSec: 5 },
                [],
                workDir,
                new AbortController().signal,
            );

            const info = probe(chunk.path);
            expect(info.streams.map((s) => s.codec_type)).toEqual(['audio']);
            expect(Math.abs(info.duration - 5)).toBeLessThan(TOLERANCE_SEC);
        });

        it('throws a permanent error when the file is larger than the limit', async () => {
            const tiny = new AudioChunker(
                {
                    maxDurationSec: MAX_DURATION_SEC,
                    maxChunkBytes: 1000,
                },
                { logger: silentLogger() },
            );
            const workDir = await mkdtemp(join(dir, 'work-'));
            const error = await tiny
                .render(
                    wav,
                    { index: 0, startSec: 0, endSec: 20 },
                    [],
                    workDir,
                    new AbortController().signal,
                )
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(TranscriptionPermanentError);
        });
    });

    describe('abort', () => {
        it('kills the ffmpeg process when the signal is aborted', async () => {
            const children: ChildProcess[] = [];
            const tracked = new AudioChunker(
                { maxDurationSec: 10_000, maxChunkBytes: MAX_CHUNK_BYTES },
                {
                    logger: silentLogger(),
                    spawn: (command, args, options) => {
                        const child = spawn(command, args, options);
                        children.push(child);
                        return child;
                    },
                },
            );
            const veryLong = join(dir, 'very-long.wav');
            ffmpeg([
                '-f',
                'lavfi',
                '-i',
                'anoisesrc=duration=1200:sample_rate=16000',
                '-ac',
                '1',
                veryLong,
            ]);
            const workDir = await mkdtemp(join(dir, 'work-'));
            const controller = new AbortController();

            const pending = tracked.render(
                veryLong,
                { index: 0, startSec: 0, endSec: 1200 },
                [],
                workDir,
                controller.signal,
            );
            setTimeout(() => {
                controller.abort();
            }, 100);

            await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
            expect(children).toHaveLength(1);
            const child = children[0];
            if (child.exitCode === null && child.signalCode === null) {
                await new Promise((resolve) => child.once('exit', resolve));
            }
            expect(child.killed).toBe(true);
            expect(child.signalCode).not.toBeNull();
        });

        it('rejects at once when the signal is already aborted', async () => {
            const controller = new AbortController();
            controller.abort();
            await expect(chunker.probe(wav, controller.signal)).rejects.toMatchObject({
                name: 'AbortError',
            });
        });
    });
});

describe('AudioChunker.checkAvailable', () => {
    it('returns false when ffmpeg is missing', async () => {
        const chunker = new AudioChunker(
            {
                maxDurationSec: 10,
                maxChunkBytes: 10,
                ffmpegPath: '/nonexistent/ffmpeg-binary',
            },
            { logger: silentLogger() },
        );
        await expect(chunker.checkAvailable()).resolves.toBe(false);
    });

    it.skipIf(!hasFfmpeg)('returns true when ffmpeg runs', async () => {
        const chunker = new AudioChunker(
            { maxDurationSec: 10, maxChunkBytes: 10 },
            { logger: silentLogger() },
        );
        await expect(chunker.checkAvailable()).resolves.toBe(true);
    });

    it('fails probe with provider-unavailable after a failed start check', async () => {
        const chunker = new AudioChunker(
            {
                maxDurationSec: 10,
                maxChunkBytes: 10,
                ffmpegPath: '/nonexistent/ffmpeg-binary',
            },
            { logger: silentLogger() },
        );
        await chunker.onModuleInit();
        const error = await chunker
            .probe('/nonexistent/input.wav', new AbortController().signal)
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TranscriptionPermanentError);
        expect(error).toMatchObject({ reason: 'provider-unavailable' });
    });
});
