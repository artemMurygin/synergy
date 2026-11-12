import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../shared/config/env.schema';
import { TranscriptionTemporaryError } from '../domain/errors';
import { planChunks } from '../domain/plan-chunks';
import { type AudioChunkerPort } from '../domain/ports/audio-chunker.port';
import { type ChunkTranscriberPort } from '../domain/ports/chunk-transcriber.port';
import {
    type MeetingAudio,
    MeetingTranscriberPort,
    type MeetingTranscription,
} from '../domain/ports/meeting-transcriber.port';
import { SpeakerRegistry } from '../domain/speaker-registry';
import { TranscriptMerger } from '../domain/transcript-merger';
import { TranscriptionUsage } from '../domain/transcription-usage';

export interface ChunkedMeetingTranscriberSettings {
    readonly chunkSec: number;
    readonly overlapSec: number;
    readonly maxExemplars: number;
    readonly exemplarSec: number;
    /** Parent of the per-recording temporary folder; `os.tmpdir()` by default. */
    readonly tmpRoot?: string;
}

const TMP_PREFIX = 'meeting-transcription-';
// Дольше любого job'а (дедлайн по умолчанию 2 ч): такая папка осталась от упавшего процесса.
const STALE_WORK_DIR_AGE_MS = 24 * 60 * 60 * 1000;
// Fixed name: the original file name is not used on disk.
const INPUT_FILE = 'input';

/**
 * Куски уходят провайдеру строго по очереди: каждый следующий несёт образцы голосов
 * уже известных спикеров.
 */
export class ChunkedMeetingTranscriber extends MeetingTranscriberPort implements OnModuleInit {
    constructor(
        private readonly chunker: AudioChunkerPort,
        private readonly provider: ChunkTranscriberPort,
        private readonly settings: ChunkedMeetingTranscriberSettings,
    ) {
        super();
    }

    static settingsFromConfig(config: ConfigService<Env, true>): ChunkedMeetingTranscriberSettings {
        return {
            chunkSec: config.get('MEETING_TRANSCRIPTION_CHUNK_SEC', { infer: true }),
            overlapSec: config.get('MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC', { infer: true }),
            maxExemplars: config.get('MEETING_TRANSCRIPTION_MAX_EXEMPLARS', { infer: true }),
            exemplarSec: config.get('MEETING_TRANSCRIPTION_EXEMPLAR_SEC', { infer: true }),
        };
    }

    // Папки упавшего процесса (до 1 ГБ записи и куски) иначе остаются в tmp навсегда.
    async onModuleInit(): Promise<void> {
        const root = this.tmpRoot();
        const now = Date.now();
        for (const entry of await readdir(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.startsWith(TMP_PREFIX)) continue;
            const path = join(root, entry.name);
            const { mtimeMs } = await stat(path);
            if (now - mtimeMs >= STALE_WORK_DIR_AGE_MS) {
                await rm(path, { recursive: true, force: true });
            }
        }
    }

    async transcribe(audio: MeetingAudio, signal: AbortSignal): Promise<MeetingTranscription> {
        let workDir: string;
        try {
            workDir = await mkdtemp(join(this.tmpRoot(), TMP_PREFIX));
        } catch (error: unknown) {
            // Иначе поток S3 держит соединение из пула клиента до таймаута.
            audio.stream.destroy();
            throw error;
        }
        try {
            const inputPath = join(workDir, INPUT_FILE);
            await this.download(audio, inputPath, signal);
            return await this.run(inputPath, workDir, signal);
        } finally {
            await rm(workDir, { recursive: true, force: true });
        }
    }

    private tmpRoot(): string {
        return this.settings.tmpRoot ?? tmpdir();
    }

    private async download(audio: MeetingAudio, path: string, signal: AbortSignal): Promise<void> {
        try {
            await pipeline(audio.stream, createWriteStream(path), { signal });
        } catch (error) {
            if (signal.aborted) throw error;
            // Storage read failure: the job may be retried.
            throw new TranscriptionTemporaryError(
                'Failed to read the recording from storage',
                error instanceof Error ? error : undefined,
            );
        }
    }

    private async run(
        inputPath: string,
        workDir: string,
        signal: AbortSignal,
    ): Promise<MeetingTranscription> {
        const { chunkSec, overlapSec, maxExemplars, exemplarSec } = this.settings;
        const { durationSec } = await this.chunker.probe(inputPath, signal);
        const registry = new SpeakerRegistry({ maxExemplars, exemplarSec });
        let language: string | null = null;
        let usage = TranscriptionUsage.zero();

        // Strictly sequential: exemplars of a chunk depend on all previous answers.
        for (const plan of planChunks(durationSec, chunkSec, overlapSec)) {
            const chunk = await this.chunker.render(
                inputPath,
                plan,
                registry.exemplars(),
                workDir,
                signal,
            );
            const answer = await this.provider.transcribe(chunk, signal);
            await rm(chunk.path, { force: true });
            registry.ingest(chunk, answer.words);
            language ??= answer.language;
            usage = TranscriptionUsage.add(usage, answer.usage);
        }

        const transcript = TranscriptMerger.merge(registry, { overlapSec }, language, durationSec);
        return { transcript, usage };
    }
}
