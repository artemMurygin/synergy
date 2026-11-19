import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { PinoLogger } from 'nestjs-pino';
import { UnsupportedVoiceAudioError, VoiceAudioUnavailableError } from '../../domain/errors';
import type { NormalizedVoiceAudio } from '../../domain/normalized-voice-audio';
import { VoiceAudioNormalizerPort } from '../../domain/ports/voice-audio-normalizer.port';

export interface FfmpegVoiceAudioNormalizerSettings {
    /** Limit for one ffprobe or ffmpeg process. */
    readonly timeoutMs: number;
    readonly ffmpegPath?: string;
    readonly ffprobePath?: string;
}

export const DEFAULT_VOICE_NORMALIZE_TIMEOUT_MS = 20_000;

const INPUT_FILE = 'input';
const OUTPUT_FILE = 'voice.ogg';
const OGG_MIME_TYPE = 'audio/ogg';

/** Containers the provider takes as they are, by the format name ffprobe reports. */
const PASSTHROUGH_MIME_TYPE: Readonly<Record<string, string | undefined>> = {
    ogg: OGG_MIME_TYPE,
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
};

const OUTPUT_ARGS = ['-vn', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-threads', '1'];

const probeSchema = z.object({
    format: z.object({ format_name: z.string().optional() }).optional(),
    packets: z
        .array(
            z.object({
                pts_time: z.string().optional(),
                duration_time: z.string().optional(),
            }),
        )
        .optional(),
});

interface RunResult {
    readonly code: number | null;
    readonly stdout: string;
}

function abortReason(signal: AbortSignal): Error {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException('The operation was aborted', 'AbortError');
}

/**
 * `VoiceAudioNormalizerPort` on ffprobe and ffmpeg. The duration is read from the audio packets,
 * because a webm from MediaRecorder has none in its metadata. ogg, mp3 and wav go through as they
 * are, everything else is re-encoded to ogg/opus. Neither the file name nor ffmpeg output is
 * logged: it may hold what the user recorded.
 */
export class FfmpegVoiceAudioNormalizer extends VoiceAudioNormalizerPort {
    private readonly ffmpegPath: string;
    private readonly ffprobePath: string;

    constructor(
        private readonly settings: FfmpegVoiceAudioNormalizerSettings,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(FfmpegVoiceAudioNormalizer.name);
        this.ffmpegPath = settings.ffmpegPath ?? 'ffmpeg';
        this.ffprobePath = settings.ffprobePath ?? 'ffprobe';
    }

    /** Checks that both binaries start; the result is logged, never thrown. */
    async checkTools(): Promise<boolean> {
        const signal = new AbortController().signal;
        try {
            await this.run(this.ffmpegPath, ['-version'], signal);
            await this.run(this.ffprobePath, ['-version'], signal);
            return true;
        } catch {
            this.logger.error('ffmpeg or ffprobe is not available: voice transcription will fail');
            return false;
        }
    }

    async normalize(
        audio: Buffer,
        _mimeType: string,
        signal: AbortSignal,
    ): Promise<NormalizedVoiceAudio> {
        const dir = await mkdtemp(join(tmpdir(), 'voice-'));
        try {
            const inputPath = join(dir, INPUT_FILE);
            await writeFile(inputPath, audio);
            const probe = await this.probe(inputPath, signal);
            const passthrough = PASSTHROUGH_MIME_TYPE[probe.formatName];
            if (passthrough !== undefined) {
                return { audio, mimeType: passthrough, durationSec: probe.durationSec };
            }
            const outputPath = join(dir, OUTPUT_FILE);
            const result = await this.run(
                this.ffmpegPath,
                [
                    '-v',
                    'error',
                    '-nostdin',
                    '-y',
                    '-i',
                    inputPath,
                    ...OUTPUT_ARGS,
                    '-f',
                    'ogg',
                    outputPath,
                ],
                signal,
            );
            if (result.code !== 0) throw new UnsupportedVoiceAudioError('Audio cannot be decoded');
            const encoded = await readFile(outputPath);
            this.logger.info(
                { durationSec: probe.durationSec, sizeBytes: encoded.byteLength },
                'Voice audio re-encoded',
            );
            return { audio: encoded, mimeType: OGG_MIME_TYPE, durationSec: probe.durationSec };
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }

    private async probe(
        inputPath: string,
        signal: AbortSignal,
    ): Promise<{ formatName: string; durationSec: number }> {
        const result = await this.run(
            this.ffprobePath,
            [
                '-v',
                'error',
                '-select_streams',
                'a:0',
                '-show_entries',
                'format=format_name:packet=pts_time,duration_time',
                '-of',
                'json',
                inputPath,
            ],
            signal,
        );
        if (result.code !== 0) throw new UnsupportedVoiceAudioError('Not a readable audio file');
        let parsed: z.infer<typeof probeSchema>;
        try {
            parsed = probeSchema.parse(JSON.parse(result.stdout));
        } catch (error) {
            throw new UnsupportedVoiceAudioError(
                'Not a readable audio file',
                error instanceof Error ? error : undefined,
            );
        }
        let durationSec = 0;
        for (const packet of parsed.packets ?? []) {
            const start = Number(packet.pts_time);
            if (!Number.isFinite(start)) continue;
            const length = Number(packet.duration_time);
            durationSec = Math.max(durationSec, start + (Number.isFinite(length) ? length : 0));
        }
        if (durationSec <= 0) throw new UnsupportedVoiceAudioError('The file has no audio');
        // A comma list such as "mov,mp4,m4a" is never one of the passthrough names.
        return { formatName: parsed.format?.format_name ?? '', durationSec };
    }

    /** Runs the process; kills it on `signal` or after the timeout. stderr is dropped. */
    private run(command: string, args: string[], signal: AbortSignal): Promise<RunResult> {
        if (signal.aborted) return Promise.reject(abortReason(signal));
        return new Promise<RunResult>((resolve, reject) => {
            const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
            const stdout: Buffer[] = [];
            let settled = false;
            const finish = (fn: () => void): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);
                fn();
            };
            const onAbort = (): void => {
                child.kill('SIGKILL');
                finish(() => {
                    reject(abortReason(signal));
                });
            };
            const timer = setTimeout(() => {
                child.kill('SIGKILL');
                finish(() => {
                    reject(new VoiceAudioUnavailableError('Audio processing timed out'));
                });
            }, this.settings.timeoutMs);
            signal.addEventListener('abort', onAbort, { once: true });
            child.stdout.on('data', (data: Buffer) => stdout.push(data));
            child.once('error', (error) => {
                finish(() => {
                    reject(new VoiceAudioUnavailableError('Failed to start ffmpeg', error));
                });
            });
            child.once('close', (code) => {
                finish(() => {
                    resolve({ code, stdout: Buffer.concat(stdout).toString() });
                });
            });
        });
    }
}
