import { createWriteStream, type Dirent } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { OnModuleInit } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { TranscriptionTemporaryError } from '../domain/errors';
import { type MeetingAudioPreparerPort } from '../domain/ports/meeting-audio-preparer.port';
import {
    type MeetingAudio,
    MeetingTranscriberPort,
    type MeetingTranscription,
} from '../domain/ports/meeting-transcriber.port';
import { type WholeFileSttPort } from '../domain/ports/whole-file-stt.port';
import { wordsToTranscript } from './words-to-transcript';

export interface WholeFileMeetingTranscriberSettings {
    readonly tmpRoot?: string;
}

const TMP_PREFIX = 'meeting-transcription-';
// Дольше любого job'а (дедлайн по умолчанию 2 ч): такая папка осталась от упавшего процесса.
const STALE_WORK_DIR_AGE_MS = 24 * 60 * 60 * 1000;
// Fixed name: the original file name is not used on disk.
const INPUT_FILE = 'input';

/**
 * Целая запись одним проходом: поток S3 -> временный файл -> один сжатый файл -> один запрос
 * в STT -> доменная расшифровка. Временная папка удаляется в `finally` при успехе, ошибке
 * и отмене.
 */
export class WholeFileMeetingTranscriber extends MeetingTranscriberPort implements OnModuleInit {
    constructor(
        private readonly preparer: MeetingAudioPreparerPort,
        private readonly stt: WholeFileSttPort,
        private readonly logger: PinoLogger,
        private readonly settings: WholeFileMeetingTranscriberSettings = {},
    ) {
        super();
        this.logger.setContext(WholeFileMeetingTranscriber.name);
    }

    // Папки упавшего процесса (до 1 ГБ записи и сжатая копия) иначе остаются в tmp навсегда.
    async onModuleInit(): Promise<void> {
        const root = this.tmpRoot();
        const now = Date.now();
        let entries: Dirent[];
        try {
            entries = await readdir(root, { withFileTypes: true });
        } catch (error) {
            if (errorCode(error) !== 'ENOENT') this.warnCleanup(error);
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || !entry.name.startsWith(TMP_PREFIX)) continue;
            const path = join(root, entry.name);
            try {
                const { mtimeMs } = await stat(path);
                if (now - mtimeMs >= STALE_WORK_DIR_AGE_MS) {
                    await rm(path, { recursive: true, force: true });
                }
            } catch (error) {
                // Best-effort: папку мог удалить другой процесс или она чужая (EPERM).
                if (errorCode(error) !== 'ENOENT') this.warnCleanup(error);
            }
        }
    }

    private warnCleanup(error: unknown): void {
        this.logger.warn({ err: error }, 'Failed to clean up stale meeting transcription folders');
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
            const prepared = await this.preparer.prepare(inputPath, workDir, signal);
            const answer = await this.stt.transcribe(prepared, signal);
            const transcript = wordsToTranscript(answer, prepared.durationSec);
            return {
                transcript,
                usage: answer.usage ?? { seconds: prepared.durationSec, cost: null },
            };
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
}

function errorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
}
