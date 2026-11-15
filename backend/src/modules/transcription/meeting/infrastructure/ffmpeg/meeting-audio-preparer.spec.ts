import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { silentLogger } from '../../../../files/application/test-doubles';
import { TranscriptionPermanentError } from '../../domain/errors';
import { FfmpegMeetingAudioPreparer } from './meeting-audio-preparer';

const hasFfmpeg =
    spawnSync('ffmpeg', ['-version']).status === 0 &&
    spawnSync('ffprobe', ['-version']).status === 0;

const MAX_DURATION_SEC = 120;
const MAX_BYTES = 20 * 1024 * 1024;
const TOLERANCE_SEC = 0.1;

function ffmpeg(args: string[]): void {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
    if (result.status !== 0) {
        throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
    }
}

const probeSchema = z.object({
    format: z.object({ duration: z.string(), format_name: z.string() }),
    streams: z.array(
        z.object({
            codec_type: z.string(),
            codec_name: z.string(),
            sample_rate: z.string().optional(),
            channels: z.number().optional(),
            bit_rate: z.string().optional(),
        }),
    ),
});

function probe(path: string): z.infer<typeof probeSchema> {
    const result = spawnSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration,format_name:stream=codec_type,codec_name,sample_rate,channels,bit_rate',
        '-of',
        'json',
        path,
    ]);
    return probeSchema.parse(JSON.parse(result.stdout.toString()));
}

function sine(path: string, durationSec: number): void {
    ffmpeg([
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${String(durationSec)}:sample_rate=44100`,
        '-ac',
        '2',
        path,
    ]);
}

async function exists(path: string): Promise<boolean> {
    return access(path).then(
        () => true,
        () => false,
    );
}

function preparer(
    overrides: Partial<{ maxDurationSec: number; maxBytes: number }> = {},
    spawnFn?: ConstructorParameters<typeof FfmpegMeetingAudioPreparer>[1]['spawn'],
): FfmpegMeetingAudioPreparer {
    return new FfmpegMeetingAudioPreparer(
        { maxDurationSec: MAX_DURATION_SEC, maxBytes: MAX_BYTES, ...overrides },
        { logger: silentLogger(), spawn: spawnFn },
    );
}

describe.skipIf(!hasFfmpeg)('FfmpegMeetingAudioPreparer (ffmpeg integration)', () => {
    let dir: string;
    let wav: string;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'ffmpeg-preparer-'));
        wav = join(dir, 'input.wav');
        sine(wav, 60);
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('turns a WAV into one ogg/opus mono 16 kHz 32 kbit/s file of the whole duration', async () => {
        const workDir = await mkdtemp(join(dir, 'work-'));
        const result = await preparer().prepare(wav, workDir, new AbortController().signal);

        expect(result.path.startsWith(workDir)).toBe(true);
        expect(result.sizeBytes).toBe((await stat(result.path)).size);
        expect(Math.abs(result.durationSec - 60)).toBeLessThan(TOLERANCE_SEC);
        expect(await readdir(workDir)).toHaveLength(1);

        const info = probe(result.path);
        expect(info.format.format_name).toBe('ogg');
        expect(info.streams).toHaveLength(1);
        expect(info.streams[0]).toMatchObject({
            codec_type: 'audio',
            codec_name: 'opus',
            channels: 1,
        });
        expect(Math.abs(Number(info.format.duration) - 60)).toBeLessThan(TOLERANCE_SEC);
        // 32 kbit/s * 60 s = 240 KB, with container overhead.
        expect(result.sizeBytes).toBeLessThan(400_000);
    });

    it('keeps only the audio of a video file, one output without chunking', async () => {
        const mp4 = join(dir, 'video.mp4');
        ffmpeg([
            '-f',
            'lavfi',
            '-i',
            'testsrc=size=64x48:rate=5:duration=6',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=330:duration=6:sample_rate=44100',
            '-c:v',
            'mpeg4',
            '-c:a',
            'aac',
            '-shortest',
            mp4,
        ]);
        const workDir = await mkdtemp(join(dir, 'work-'));
        const result = await preparer().prepare(mp4, workDir, new AbortController().signal);

        const info = probe(result.path);
        expect(info.streams).toHaveLength(1);
        expect(info.streams[0].codec_type).toBe('audio');
        expect(Math.abs(result.durationSec - 6)).toBeLessThan(TOLERANCE_SEC);
        expect(await readdir(workDir)).toHaveLength(1);
    });

    it('throws too-long before encoding when the duration exceeds the maximum', async () => {
        const longWav = join(dir, 'long.wav');
        sine(longWav, MAX_DURATION_SEC + 10);
        const workDir = await mkdtemp(join(dir, 'work-'));
        const commands: string[] = [];
        const error = await preparer({}, (command, args, options) => {
            commands.push(command);
            return spawn(command, args, options);
        })
            .prepare(longWav, workDir, new AbortController().signal)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(TranscriptionPermanentError);
        expect(error).toMatchObject({ reason: 'too-long' });
        expect(commands).toEqual(['ffprobe']);
        expect(await readdir(workDir)).toHaveLength(0);
    });

    it('throws unsupported-media for a broken file', async () => {
        const broken = join(dir, 'broken.mp3');
        await writeFile(broken, Buffer.from('definitely not audio'.repeat(100)));
        const workDir = await mkdtemp(join(dir, 'work-'));
        const error = await preparer()
            .prepare(broken, workDir, new AbortController().signal)
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
        const workDir = await mkdtemp(join(dir, 'work-'));
        const error = await preparer()
            .prepare(silentVideo, workDir, new AbortController().signal)
            .catch((e: unknown) => e);
        expect(error).toMatchObject({ reason: 'unsupported-media' });
    });

    it('throws too-long and removes the file when the result is larger than the limit', async () => {
        const workDir = await mkdtemp(join(dir, 'work-'));
        const error = await preparer({ maxBytes: 1000 })
            .prepare(wav, workDir, new AbortController().signal)
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TranscriptionPermanentError);
        expect(error).toMatchObject({ reason: 'too-long' });
        expect(await readdir(workDir)).toHaveLength(0);
    });

    it('kills ffmpeg and removes the partial file when the signal is aborted', async () => {
        const children: ChildProcess[] = [];
        const tracked = preparer({ maxDurationSec: 10_000 }, (command, args, options) => {
            const child = spawn(command, args, options);
            children.push(child);
            return child;
        });
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

        const pending = tracked.prepare(veryLong, workDir, controller.signal);
        setTimeout(() => {
            controller.abort();
        }, 150);

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        const ffmpegChild = children[children.length - 1];
        if (ffmpegChild.exitCode === null && ffmpegChild.signalCode === null) {
            await new Promise((resolve) => ffmpegChild.once('exit', resolve));
        }
        expect(ffmpegChild.signalCode).not.toBeNull();
        expect(await exists(join(workDir, 'meeting.ogg'))).toBe(false);
    });

    it('rejects at once when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const workDir = await mkdtemp(join(dir, 'work-'));
        await expect(preparer().prepare(wav, workDir, controller.signal)).rejects.toMatchObject({
            name: 'AbortError',
        });
    });
});

describe('FfmpegMeetingAudioPreparer without binaries', () => {
    it('throws provider-unavailable when ffprobe is missing', async () => {
        const p = new FfmpegMeetingAudioPreparer(
            { maxDurationSec: 10, maxBytes: 10, ffprobePath: '/nonexistent/ffprobe' },
            { logger: silentLogger() },
        );
        const error = await p
            .prepare('/nonexistent/in.wav', tmpdir(), new AbortController().signal)
            .catch((e: unknown) => e);
        expect(error).toMatchObject({ reason: 'provider-unavailable' });
    });
});
