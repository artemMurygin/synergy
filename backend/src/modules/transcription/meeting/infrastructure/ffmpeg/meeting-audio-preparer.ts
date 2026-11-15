import { type ChildProcess, type SpawnOptions, spawn as nodeSpawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { Env } from '../../../../../shared/config/env.schema';
import { TranscriptionPermanentError } from '../../domain/errors';
import {
    MeetingAudioPreparerPort,
    type PreparedMeetingAudio,
} from '../../domain/ports/meeting-audio-preparer.port';

export interface MeetingAudioPreparerSettings {
    readonly maxDurationSec: number;
    /** Предел размера сжатого файла, байты. */
    readonly maxBytes: number;
    readonly ffmpegPath?: string;
    readonly ffprobePath?: string;
}

export type SpawnProcess = (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
) => ChildProcess;

export interface MeetingAudioPreparerDeps {
    readonly logger: PinoLogger;
    readonly spawn?: SpawnProcess;
}

export const PREPARED_AUDIO_FILE_NAME = 'meeting.ogg';

// Mono 16 kHz Opus 32 kbit/s, no video; one pass over the whole track.
const OUTPUT_ARGS = ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k'];

const probeSchema = z.object({
    format: z.object({ duration: z.string().optional() }).optional(),
    streams: z.array(z.object({ codec_type: z.string().optional() })).optional(),
});

interface RunResult {
    readonly code: number | null;
    readonly stdout: string;
}

class SpawnFailedError extends Error {}

function abortReason(signal: AbortSignal): Error {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException('The operation was aborted', 'AbortError');
}

/** `MeetingAudioPreparerPort` на `ffprobe` и `ffmpeg`: один OGG на всю запись, без нарезки. */
export class FfmpegMeetingAudioPreparer extends MeetingAudioPreparerPort {
    private readonly logger: PinoLogger;
    private readonly ffmpegPath: string;
    private readonly ffprobePath: string;
    private readonly spawn: SpawnProcess;

    constructor(
        private readonly settings: MeetingAudioPreparerSettings,
        deps: MeetingAudioPreparerDeps,
    ) {
        super();
        this.logger = deps.logger;
        this.logger.setContext(FfmpegMeetingAudioPreparer.name);
        this.ffmpegPath = settings.ffmpegPath ?? 'ffmpeg';
        this.ffprobePath = settings.ffprobePath ?? 'ffprobe';
        this.spawn = deps.spawn ?? nodeSpawn;
    }

    static settingsFromConfig(
        config: ConfigService<Env, true>,
        maxBytes: number,
    ): MeetingAudioPreparerSettings {
        return {
            maxDurationSec: config.get('MEETING_TRANSCRIPTION_MAX_DURATION_SEC', { infer: true }),
            maxBytes,
        };
    }

    async prepare(
        inputPath: string,
        workDir: string,
        signal: AbortSignal,
    ): Promise<PreparedMeetingAudio> {
        const durationSec = await this.probeDuration(inputPath, signal);
        const outputPath = join(workDir, PREPARED_AUDIO_FILE_NAME);
        try {
            return await this.encode(inputPath, outputPath, durationSec, signal);
        } catch (error) {
            await rm(outputPath, { force: true });
            throw error;
        }
    }

    private async probeDuration(inputPath: string, signal: AbortSignal): Promise<number> {
        const result = await this.exec(
            this.ffprobePath,
            [
                '-v',
                'error',
                '-show_entries',
                'format=duration:stream=codec_type',
                '-of',
                'json',
                inputPath,
            ],
            signal,
        );
        if (result.code !== 0) {
            throw new TranscriptionPermanentError('unsupported-media');
        }

        let parsed: z.infer<typeof probeSchema>;
        try {
            parsed = probeSchema.parse(JSON.parse(result.stdout));
        } catch (error) {
            throw new TranscriptionPermanentError(
                'unsupported-media',
                undefined,
                error instanceof Error ? error : undefined,
            );
        }

        const hasAudio = (parsed.streams ?? []).some((s) => s.codec_type === 'audio');
        const durationSec = Number(parsed.format?.duration);
        if (!hasAudio || !Number.isFinite(durationSec) || durationSec <= 0) {
            throw new TranscriptionPermanentError('unsupported-media');
        }
        if (durationSec > this.settings.maxDurationSec) {
            throw new TranscriptionPermanentError('too-long', undefined, undefined, {
                durationSec,
                maxDurationSec: this.settings.maxDurationSec,
            });
        }
        return durationSec;
    }

    private async encode(
        inputPath: string,
        outputPath: string,
        durationSec: number,
        signal: AbortSignal,
    ): Promise<PreparedMeetingAudio> {
        const result = await this.exec(
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
        if (result.code !== 0) {
            throw new TranscriptionPermanentError('unsupported-media', undefined, undefined, {
                exitCode: result.code,
            });
        }

        const { size } = await stat(outputPath);
        if (size > this.settings.maxBytes) {
            throw new TranscriptionPermanentError(
                'too-long',
                'Prepared audio is larger than the whole-file size limit',
                undefined,
                { sizeBytes: size, maxBytes: this.settings.maxBytes },
            );
        }
        this.logger.info({ durationSec, sizeBytes: size }, 'Meeting audio prepared');
        return Object.freeze({ path: outputPath, durationSec, sizeBytes: size });
    }

    /** `run` with a missing binary mapped to `provider-unavailable`. */
    private async exec(command: string, args: string[], signal: AbortSignal): Promise<RunResult> {
        try {
            return await this.run(command, args, signal);
        } catch (error) {
            if (error instanceof SpawnFailedError) {
                throw new TranscriptionPermanentError(
                    'provider-unavailable',
                    undefined,
                    error.cause instanceof Error ? error.cause : undefined,
                );
            }
            throw error;
        }
    }

    /** Runs the process; kills it with SIGKILL and rejects with the abort reason on `signal`. */
    private run(command: string, args: string[], signal: AbortSignal): Promise<RunResult> {
        if (signal.aborted) {
            return Promise.reject(abortReason(signal));
        }
        return new Promise<RunResult>((resolve, reject) => {
            const child = this.spawn(command, args, {
                // stderr is dropped: it may hold file names.
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const stdout: Buffer[] = [];
            let settled = false;

            const finish = (fn: () => void): void => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                fn();
            };
            const onAbort = (): void => {
                child.kill('SIGKILL');
                finish(() => {
                    reject(abortReason(signal));
                });
            };
            signal.addEventListener('abort', onAbort, { once: true });

            child.stdout?.on('data', (data: Buffer) => stdout.push(data));
            child.once('error', (error) => {
                finish(() => {
                    reject(new SpawnFailedError('Failed to start process', { cause: error }));
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
