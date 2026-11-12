import { type ChildProcess, type SpawnOptions, spawn as nodeSpawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { Env } from '../../../../../shared/config/env.schema';
import { AudioChunk } from '../../domain/audio-chunk';
import { TranscriptionPermanentError } from '../../domain/errors';
import {
    AudioChunkerPort,
    type ChunkPlan,
    EXEMPLAR_GAP_SEC,
    type ExemplarPlacement,
    type RenderedAudioChunk,
    type SpeakerExemplar,
} from '../../domain/ports/audio-chunker.port';

export interface AudioChunkerSettings {
    readonly maxDurationSec: number;
    readonly maxChunkBytes: number;
    readonly ffmpegPath?: string;
    readonly ffprobePath?: string;
}

export type SpawnProcess = (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
) => ChildProcess;

export interface AudioChunkerDeps {
    readonly logger: PinoLogger;
    readonly spawn?: SpawnProcess;
}

const SAMPLE_RATE = '16000';
// Output: mono 16 kHz opus 32 kbit/s in ogg, no video (design.md, decision 8).
const OUTPUT_ARGS = ['-vn', '-ac', '1', '-ar', SAMPLE_RATE, '-c:a', 'libopus', '-b:a', '32k'];
const AUDIO_FORMAT = `aformat=sample_fmts=fltp:sample_rates=${SAMPLE_RATE}:channel_layouts=mono`;

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

/** Number for ffmpeg time options, without exponent notation. */
function sec(value: number): string {
    return value.toFixed(6);
}

/** `AudioChunkerPort` on top of the `ffprobe` and `ffmpeg` binaries. */
export class AudioChunker extends AudioChunkerPort implements OnModuleInit {
    private readonly logger: PinoLogger;
    private readonly ffmpegPath: string;
    private readonly ffprobePath: string;
    private readonly spawn: SpawnProcess;
    private available = true;

    constructor(
        private readonly settings: AudioChunkerSettings,
        deps: AudioChunkerDeps,
    ) {
        super();
        this.logger = deps.logger;
        this.logger.setContext(AudioChunker.name);
        this.ffmpegPath = settings.ffmpegPath ?? 'ffmpeg';
        this.ffprobePath = settings.ffprobePath ?? 'ffprobe';
        this.spawn = deps.spawn ?? nodeSpawn;
    }

    static settingsFromConfig(config: ConfigService<Env, true>): AudioChunkerSettings {
        return {
            maxDurationSec: config.get('MEETING_TRANSCRIPTION_MAX_DURATION_SEC', { infer: true }),
            maxChunkBytes: config.get('MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES', { infer: true }),
        };
    }

    async onModuleInit(): Promise<void> {
        this.available = await this.checkAvailable();
        if (!this.available) {
            this.logger.error(
                { ffmpegPath: this.ffmpegPath },
                'ffmpeg is not available, meeting transcriptions will fail',
            );
        }
    }

    /** `ffmpeg -version` exits with 0. */
    async checkAvailable(): Promise<boolean> {
        try {
            const result = await this.run(
                this.ffmpegPath,
                ['-version'],
                new AbortController().signal,
            );
            return result.code === 0;
        } catch {
            return false;
        }
    }

    async probe(inputPath: string, signal: AbortSignal): Promise<{ durationSec: number }> {
        this.ensureAvailable();
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
        return { durationSec };
    }

    async render(
        inputPath: string,
        chunk: ChunkPlan,
        exemplars: readonly SpeakerExemplar[],
        workDir: string,
        signal: AbortSignal,
    ): Promise<RenderedAudioChunk> {
        this.ensureAvailable();

        // Segments in file order: each exemplar, then the chunk itself.
        const segments = [
            ...exemplars.map((e) => ({ startSec: e.startSec, durationSec: e.endSec - e.startSec })),
            { startSec: chunk.startSec, durationSec: chunk.endSec - chunk.startSec },
        ];

        const layout: ExemplarPlacement[] = [];
        let cursor = 0;
        for (const exemplar of exemplars) {
            const start = cursor;
            cursor += exemplar.endSec - exemplar.startSec;
            layout.push({
                globalSpeakerId: exemplar.globalSpeakerId,
                startInFileSec: start,
                endInFileSec: cursor,
            });
            cursor += EXEMPLAR_GAP_SEC;
        }
        const prefixSec = cursor;

        const inputArgs: string[] = [];
        for (const segment of segments) {
            inputArgs.push(
                '-ss',
                sec(segment.startSec),
                '-t',
                sec(segment.durationSec),
                '-i',
                inputPath,
            );
        }

        // Each segment is padded and trimmed to its exact length, so the layout matches the file.
        const filters: string[] = [];
        const concatInputs: string[] = [];
        segments.forEach((segment, index) => {
            const i = String(index);
            const d = sec(segment.durationSec);
            filters.push(
                `[${i}:a:0]aresample=${SAMPLE_RATE},${AUDIO_FORMAT},apad=whole_dur=${d},atrim=duration=${d},asetpts=N/SR/TB[s${i}]`,
            );
            concatInputs.push(`[s${i}]`);
            if (index < exemplars.length) {
                filters.push(
                    `anullsrc=r=${SAMPLE_RATE}:cl=mono,${AUDIO_FORMAT},atrim=duration=${sec(EXEMPLAR_GAP_SEC)}[g${i}]`,
                );
                concatInputs.push(`[g${i}]`);
            }
        });
        filters.push(
            `${concatInputs.join('')}concat=n=${String(concatInputs.length)}:v=0:a=1[out]`,
        );

        const outputPath = join(workDir, `chunk-${String(chunk.index)}.ogg`);
        const result = await this.exec(
            this.ffmpegPath,
            [
                '-v',
                'error',
                '-nostdin',
                '-y',
                ...inputArgs,
                '-filter_complex',
                filters.join(';'),
                '-map',
                '[out]',
                ...OUTPUT_ARGS,
                '-f',
                'ogg',
                outputPath,
            ],
            signal,
        );
        if (result.code !== 0) {
            throw new TranscriptionPermanentError('unsupported-media', undefined, undefined, {
                index: chunk.index,
                exitCode: result.code,
            });
        }

        const { size } = await stat(outputPath);
        if (size > this.settings.maxChunkBytes) {
            // A configuration error: the chunk length does not fit the provider limit.
            throw new TranscriptionPermanentError(
                'too-long',
                'Rendered chunk is larger than MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES',
                undefined,
                { index: chunk.index, sizeBytes: size, maxBytes: this.settings.maxChunkBytes },
            );
        }

        const base = AudioChunk.of(
            {
                index: chunk.index,
                path: outputPath,
                startSec: chunk.startSec,
                endSec: chunk.endSec,
                sizeBytes: size,
            },
            this.settings.maxChunkBytes,
        );
        return Object.freeze({ ...base, prefixSec, exemplarLayout: Object.freeze(layout) });
    }

    private ensureAvailable(): void {
        if (!this.available) {
            throw new TranscriptionPermanentError('provider-unavailable');
        }
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
