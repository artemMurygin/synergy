import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import { PinoLogger } from 'nestjs-pino';
import type { CommonQueryMethods } from 'slonik';
import { vi } from 'vitest';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../../shared/ddd';
import { FileTooLargeError, UnsupportedMediaTypeError } from '../domain/errors';
import { MediaType } from '../domain/media-type';
import { RetentionPolicy } from '../domain/retention-policy';
import type { StoredFile } from '../domain/stored-file';
import { FilesClockPort } from '../domain/ports/clock.port';
import { DownloadTokenPort, type DownloadTokenSigned } from '../domain/ports/download-token.port';
import { FilesSettingsPort } from '../domain/ports/files-settings.port';
import { MediaTypeDetectorPort } from '../domain/ports/media-type-detector.port';
import { ObjectStoragePort, type PutObjectOptions } from '../domain/ports/object-storage.port';
import {
    StoredFileRepositoryPort,
    type StoredFileCursor,
} from '../domain/ports/stored-file-repository.port';

export const NOW = new Date('2026-03-01T09:00:00.000Z');

export function silentLogger(): PinoLogger {
    return new PinoLogger({ pinoHttp: { level: 'silent' } });
}

export class FakeClock extends FilesClockPort {
    constructor(public current: Date = NOW) {
        super();
    }

    now(): Date {
        return new Date(this.current.getTime());
    }
}

export const testRetentionPolicy = (): RetentionPolicy =>
    new RetentionPolicy({ documentDays: 30, recordingDays: 1, maxHoldDays: 7 });

export class FakeFilesSettings extends FilesSettingsPort {
    maxRecordingBytes = 64;
    maxDocumentBytes = 16;
    downloadLinkTtlSec = 300;
}

/** Участник транзакции: снимок состояния и функция отката к нему. */
export interface TransactionParticipant {
    snapshot(): () => void;
}

export class InMemoryTransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<(() => void)[]>();

    commits = 0;

    rollbacks = 0;

    constructor(private readonly participants: readonly TransactionParticipant[] = []) {
        super();
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        const restores = this.participants.map((participant) => participant.snapshot());
        const callbacks: (() => void)[] = [];
        try {
            const result = await this.storage.run(callbacks, work);
            this.commits += 1;
            for (const callback of callbacks) callback();
            return result;
        } catch (error: unknown) {
            this.rollbacks += 1;
            for (const restore of restores) restore();
            throw error;
        }
    }

    async savepoint<T>(work: () => Promise<T>): Promise<T> {
        const parentCallbacks = this.storage.getStore();
        if (parentCallbacks === undefined) return this.run(work);
        const restores = this.participants.map((participant) => participant.snapshot());
        const callbacks: (() => void)[] = [];
        try {
            const result = await this.storage.run(callbacks, work);
            parentCallbacks.push(...callbacks);
            return result;
        } catch (error: unknown) {
            for (const restore of restores) restore();
            throw error;
        }
    }

    executor(): CommonQueryMethods {
        throw new Error('InMemoryTransactionRunner has no database connection');
    }

    afterCommit(callback: () => void): void {
        const callbacks = this.storage.getStore();
        if (callbacks === undefined) {
            throw new Error('afterCommit was called outside a transaction');
        }
        callbacks.push(callback);
    }

    isInTransaction(): boolean {
        return this.storage.getStore() !== undefined;
    }
}

export class RecordingEventPublisher extends DomainEventPublisherPort {
    readonly published: DomainEvent[] = [];

    readonly publishedInTransaction: boolean[] = [];

    failure: Error | null = null;

    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    publish(events: readonly DomainEvent[]): Promise<void> {
        this.publishedInTransaction.push(this.transactions.isInTransaction());
        if (this.failure !== null) return Promise.reject(this.failure);
        this.published.push(...events);
        return Promise.resolve();
    }
}

export class InMemoryObjectStorage extends ObjectStoragePort {
    readonly objects = new Map<string, { content: Buffer; contentType: string }>();

    put = vi.fn(async (stream: Readable, options: PutObjectOptions) => {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of stream) {
            const buffer = toBuffer(chunk);
            size += buffer.length;
            // Как ObjectStorage: при превышении объекта не остаётся.
            if (size > options.maxBytes) throw new FileTooLargeError(options.maxBytes);
            chunks.push(buffer);
        }
        this.objects.set(options.key, {
            content: Buffer.concat(chunks),
            contentType: options.contentType,
        });
        return { sizeBytes: size };
    });

    get = vi.fn((key: string) => {
        const object = this.objects.get(key);
        return Promise.resolve(object === undefined ? null : Readable.from([object.content]));
    });

    delete = vi.fn((key: string) => {
        this.objects.delete(key);
        return Promise.resolve();
    });

    ensureBucket = vi.fn(() => Promise.resolve());
}

export class InMemoryStoredFileRepository
    extends StoredFileRepositoryPort
    implements TransactionParticipant
{
    readonly byId = new Map<string, StoredFile>();

    failure: Error | null = null;

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, file] of saved) this.byId.set(id, file);
        };
    }

    save = vi.fn((file: StoredFile) => {
        if (this.failure !== null) return Promise.reject(this.failure);
        this.byId.set(file.id, file);
        return Promise.resolve();
    });

    findById = vi.fn((id: string) => Promise.resolve(this.byId.get(id) ?? null));

    /** Подставляется тестом, чтобы проверить, что блокировка берётся внутри транзакции. */
    transactions: TransactionRunnerPort | null = null;

    readonly lockedInTransaction: boolean[] = [];

    findByIdForUpdate = vi.fn((id: string) => {
        this.lockedInTransaction.push(this.transactions?.isInTransaction() ?? false);
        return Promise.resolve(this.byId.get(id) ?? null);
    });

    findExpired = vi.fn(
        (now: Date, policy: RetentionPolicy, limit: number, after: StoredFileCursor | null) =>
            Promise.resolve(
                [...this.byId.values()]
                    .filter((file) => file.isExpired(now, policy))
                    .sort(compareByCursor)
                    .filter((file) => after === null || compareByCursor(file, after) > 0)
                    .slice(0, limit),
            ),
    );
}

function compareByCursor(a: StoredFileCursor, b: StoredFileCursor): number {
    const byTime = a.uploadedAt.getTime() - b.uploadedAt.getTime();
    if (byTime !== 0) return byTime;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

/** Тип задаётся тестом; `null` — тип вне белого списка. */
export class FakeMediaTypeDetector extends MediaTypeDetectorPort {
    mime: string | null = 'application/pdf';

    detect = vi.fn((_head: Buffer, _fileName: string) => {
        if (this.mime === null) return Promise.reject(new UnsupportedMediaTypeError(null));
        return Promise.resolve(MediaType.of(this.mime));
    });
}

/** Токен — `token:<fileId>:<expiresAtMs>`; проверка учитывает часы. */
export class FakeDownloadTokens extends DownloadTokenPort {
    constructor(private readonly clock: FilesClockPort) {
        super();
    }

    sign = vi.fn((fileId: string, ttlSec: number): DownloadTokenSigned => {
        const expiresAt = new Date(this.clock.now().getTime() + ttlSec * 1000);
        return { token: `token:${fileId}:${String(expiresAt.getTime())}`, expiresAt };
    });

    verify = vi.fn((token: string, fileId: string): boolean => {
        const [prefix, id, expiresAtMs] = token.split(':');
        return (
            prefix === 'token' && id === fileId && Number(expiresAtMs) > this.clock.now().getTime()
        );
    });
}

export async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(toBuffer(chunk));
    return Buffer.concat(chunks);
}

function toBuffer(chunk: unknown): Buffer {
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) return Buffer.from(chunk);
    throw new TypeError('Unexpected stream chunk type');
}
