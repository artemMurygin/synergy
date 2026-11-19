import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { UnsupportedVoiceAudioError, VoiceAudioUnavailableError } from '../../domain/errors';
import { recordingLogger } from '../../application/test-doubles';
import { FfmpegVoiceAudioNormalizer } from './ffmpeg-voice-audio-normalizer';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function ffmpeg(args: string[]): Buffer {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=2', ...args], {
        maxBuffer: 10_000_000,
    });
    if (result.status !== 0) throw new Error('fixture failed');
    return result.stdout;
}

const idle = new AbortController().signal;

describe.skipIf(!hasFfmpeg)('FfmpegVoiceAudioNormalizer', () => {
    let webm: Buffer;
    let ogg: Buffer;
    let wav: Buffer;
    const make = (settings: { timeoutMs?: number } = {}): FfmpegVoiceAudioNormalizer =>
        new FfmpegVoiceAudioNormalizer(
            { timeoutMs: 20_000, ...settings },
            recordingLogger().logger,
        );

    beforeAll(() => {
        // webm to a pipe has no duration in its metadata, like a MediaRecorder recording.
        webm = ffmpeg(['-c:a', 'libopus', '-f', 'webm', 'pipe:1']);
        ogg = ffmpeg(['-c:a', 'libopus', '-f', 'ogg', 'pipe:1']);
        wav = ffmpeg(['-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1']);
    });

    it('measures the duration of a webm without duration in metadata and re-encodes it to ogg', async () => {
        const result = await make().normalize(webm, 'audio/webm;codecs=opus', idle);
        expect(result.durationSec).toBeGreaterThan(1.8);
        expect(result.durationSec).toBeLessThan(2.3);
        expect(result.mimeType).toBe('audio/ogg');
        expect(result.audio.subarray(0, 4).toString('latin1')).toBe('OggS');
    });

    it.each([
        ['ogg', 'audio/ogg'],
        ['wav', 'audio/wav'],
    ])('does not re-encode %s', async (kind, mimeType) => {
        const input = kind === 'ogg' ? ogg : wav;
        const result = await make().normalize(input, mimeType, idle);
        expect(result.audio.equals(input)).toBe(true);
        expect(result.mimeType).toBe(mimeType);
        expect(result.durationSec).toBeGreaterThan(1.8);
        expect(result.durationSec).toBeLessThan(2.3);
    });

    it('rejects a text file as unsupported', async () => {
        await expect(
            make().normalize(Buffer.from('not audio at all'), 'audio/webm', idle),
        ).rejects.toBeInstanceOf(UnsupportedVoiceAudioError);
    });

    it('stops when the signal is aborted', async () => {
        const controller = new AbortController();
        const pending = make().normalize(webm, 'audio/webm', controller.signal);
        controller.abort(new Error('closed'));
        await expect(pending).rejects.toThrow('closed');
    });

    it('stops on timeout', async () => {
        await expect(
            make({ timeoutMs: 1 }).normalize(webm, 'audio/webm', idle),
        ).rejects.toBeInstanceOf(VoiceAudioUnavailableError);
    });

    it('reports a missing binary as unavailable', async () => {
        const normalizer = new FfmpegVoiceAudioNormalizer(
            { timeoutMs: 5000, ffprobePath: '/nonexistent/ffprobe' },
            recordingLogger().logger,
        );
        await expect(normalizer.normalize(webm, 'audio/webm', idle)).rejects.toBeInstanceOf(
            VoiceAudioUnavailableError,
        );
    });
});
