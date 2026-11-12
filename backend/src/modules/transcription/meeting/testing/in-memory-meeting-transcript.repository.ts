import type { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';

type ConcurrentWrite = () => Promise<void>;

/**
 * Хранит копии агрегатов по `fileId`, как таблица `meeting_transcript`: изменение
 * прочитанного агрегата не видно другим читателям до `save`.
 */
export class InMemoryMeetingTranscriptRepository extends MeetingTranscriptRepositoryPort {
    readonly items = new Map<string, MeetingTranscript>();

    /** Подставляется тестом, чтобы проверить, что блокировка берётся внутри транзакции. */
    transactions: TransactionRunnerPort | null = null;

    readonly lockedInTransaction: boolean[] = [];

    private concurrentWrite: ConcurrentWrite | null = null;

    /**
     * Чужая запись, которая вклинится в следующее чтение. Чтение без блокировки уже вернуло
     * снимок, и запись его не меняет; `FOR UPDATE` ждёт завершения записи и видит её результат.
     */
    interleaveOnNextRead(write: ConcurrentWrite): void {
        this.concurrentWrite = write;
    }

    insertPendingIfAbsent(transcript: MeetingTranscript): Promise<boolean> {
        if (this.items.has(transcript.fileId)) return Promise.resolve(false);
        this.items.set(transcript.fileId, copyOf(transcript));
        return Promise.resolve(true);
    }

    async findByFileId(fileId: string): Promise<MeetingTranscript | null> {
        const snapshot = this.read(fileId);
        await this.runConcurrentWrite();
        return snapshot;
    }

    async findByFileIdForUpdate(fileId: string): Promise<MeetingTranscript | null> {
        this.lockedInTransaction.push(this.transactions?.isInTransaction() ?? false);
        await this.runConcurrentWrite();
        return this.read(fileId);
    }

    save(transcript: MeetingTranscript): Promise<void> {
        this.items.set(transcript.fileId, copyOf(transcript));
        return Promise.resolve();
    }

    private read(fileId: string): MeetingTranscript | null {
        const stored = this.items.get(fileId);
        return stored === undefined ? null : copyOf(stored);
    }

    private async runConcurrentWrite(): Promise<void> {
        const write = this.concurrentWrite;
        this.concurrentWrite = null;
        if (write !== null) await write();
    }
}

function copyOf(transcript: MeetingTranscript): MeetingTranscript {
    return MeetingTranscript.restore({
        fileId: transcript.fileId,
        ownerId: transcript.ownerId,
        status: transcript.status,
        failureReason: transcript.failureReason,
        language: transcript.language,
        durationSec: transcript.durationSec,
        speakerCount: transcript.speakerCount,
        speakerNames: transcript.speakerNames,
        attempts: transcript.attempts,
        completedAt: transcript.completedAt,
        createdAt: transcript.createdAt,
        updatedAt: transcript.updatedAt,
    });
}
