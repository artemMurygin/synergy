import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDeletedEvent } from '../domain/events/file-deleted.event';
import { FileName } from '../domain/file-name';
import { MediaType } from '../domain/media-type';
import type { RetentionPolicy } from '../domain/retention-policy';
import { StoredFile } from '../domain/stored-file';
import { PURGE_BATCH_SIZE, PurgeExpiredFilesUseCase } from './purge-expired-files.use-case';
import {
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    NOW,
    RecordingEventPublisher,
    silentLogger,
    testRetentionPolicy,
} from './test-doubles';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function daysAfter(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY);
}

describe('PurgeExpiredFilesUseCase', () => {
    let files: InMemoryStoredFileRepository;
    let storage: InMemoryObjectStorage;
    let policy: RetentionPolicy;
    let transactions: InMemoryTransactionRunner;
    let events: RecordingEventPublisher;
    let logger: ReturnType<typeof silentLogger>;
    let purge: PurgeExpiredFilesUseCase;
    let sequence: number;

    beforeEach(() => {
        files = new InMemoryStoredFileRepository();
        storage = new InMemoryObjectStorage();
        policy = testRetentionPolicy();
        transactions = new InMemoryTransactionRunner([files]);
        files.transactions = transactions;
        events = new RecordingEventPublisher(transactions);
        logger = silentLogger();
        purge = new PurgeExpiredFilesUseCase(files, storage, policy, transactions, events, logger);
        sequence = 0;
    });

    function seed(mime: string, uploadedAt: Date = NOW, withObject = true): StoredFile {
        sequence += 1;
        const id = `file-${String(sequence).padStart(4, '0')}`;
        const file = StoredFile.upload(
            {
                id,
                ownerId: 'owner-1',
                name: FileName.of(mime.startsWith('audio') ? 'meeting.mp3' : 'Отчёт.pdf'),
                mediaType: MediaType.of(mime),
                sizeBytes: 5,
                storageKey: `files/${id}`,
                now: uploadedAt,
            },
            policy,
        );
        file.pullDomainEvents();
        files.byId.set(file.id, file);
        if (withObject) {
            storage.objects.set(file.storageKey, {
                content: Buffer.from('hello'),
                contentType: mime,
            });
        }
        return file;
    }

    it('deletes an expired document object and marks the file deleted', async () => {
        const file = seed('application/pdf');
        const now = daysAfter(NOW, 30);

        const result = await purge.execute(now);

        expect(result).toEqual({ deleted: 1, failed: 0 });
        expect(storage.objects.has(file.storageKey)).toBe(false);
        const saved = files.byId.get(file.id);
        expect(saved?.status).toBe('deleted');
        expect(saved?.deletedAt).toEqual(now);
        expect(files.save).toHaveBeenCalledTimes(1);
    });

    it('deletes a recording one day after its hold was released', async () => {
        const file = seed('audio/mpeg');
        file.releaseHold(daysAfter(NOW, 1), policy);

        expect(await purge.execute(new Date(daysAfter(NOW, 2).getTime() - HOUR))).toEqual({
            deleted: 0,
            failed: 0,
        });
        const result = await purge.execute(daysAfter(NOW, 2));

        expect(result).toEqual({ deleted: 1, failed: 0 });
        expect(files.byId.get(file.id)?.status).toBe('deleted');
        expect(storage.objects.has(file.storageKey)).toBe(false);
    });

    it('deletes a recording whose hold is stuck past its end plus one day', async () => {
        const file = seed('audio/mpeg');

        const result = await purge.execute(daysAfter(NOW, 8));

        expect(result).toEqual({ deleted: 1, failed: 0 });
        expect(files.byId.get(file.id)?.status).toBe('deleted');
        expect(storage.objects.has(file.storageKey)).toBe(false);
    });

    it('leaves held recordings within 7 days and active documents untouched', async () => {
        const recording = seed('audio/mpeg');
        const document = seed('application/pdf');

        const result = await purge.execute(daysAfter(NOW, 7));

        expect(result).toEqual({ deleted: 0, failed: 0 });
        expect(files.byId.get(recording.id)?.status).toBe('active');
        expect(files.byId.get(document.id)?.status).toBe('active');
        expect(storage.objects.size).toBe(2);
        expect(storage.delete).not.toHaveBeenCalled();
        expect(files.save).not.toHaveBeenCalled();
    });

    it('treats a missing object as already deleted', async () => {
        const file = seed('application/pdf', NOW, false);

        const result = await purge.execute(daysAfter(NOW, 31));

        expect(result).toEqual({ deleted: 1, failed: 0 });
        expect(storage.delete).toHaveBeenCalledWith(file.storageKey);
        expect(files.byId.get(file.id)?.status).toBe('deleted');
    });

    it('keeps going after one delete fails and counts it as failed', async () => {
        const broken = seed('application/pdf');
        const first = seed('application/pdf', new Date(NOW.getTime() + HOUR));
        const second = seed('application/pdf', new Date(NOW.getTime() + 2 * HOUR));
        storage.delete.mockImplementation((key: string) => {
            if (key === broken.storageKey) return Promise.reject(new Error('storage is down'));
            storage.objects.delete(key);
            return Promise.resolve();
        });

        const result = await purge.execute(daysAfter(NOW, 31));

        expect(result).toEqual({ deleted: 2, failed: 1 });
        expect(files.byId.get(broken.id)?.status).toBe('active');
        expect(storage.objects.has(broken.storageKey)).toBe(true);
        expect(files.byId.get(first.id)?.status).toBe('deleted');
        expect(files.byId.get(second.id)?.status).toBe('deleted');
    });

    it('counts a failed save as failed and goes on', async () => {
        seed('application/pdf');
        const other = seed('application/pdf', new Date(NOW.getTime() + HOUR));
        files.save.mockImplementationOnce(() => Promise.reject(new Error('db is down')));

        const result = await purge.execute(daysAfter(NOW, 31));

        expect(result).toEqual({ deleted: 1, failed: 1 });
        expect(files.byId.get(other.id)?.status).toBe('deleted');
    });

    it('processes expired files in batches of 100', async () => {
        const total = PURGE_BATCH_SIZE * 2 + 50;
        for (let index = 0; index < total; index += 1) {
            seed('application/pdf', new Date(NOW.getTime() + index * 1000));
        }

        const result = await purge.execute(daysAfter(NOW, 31));

        expect(PURGE_BATCH_SIZE).toBe(100);
        expect(result).toEqual({ deleted: total, failed: 0 });
        expect(files.findExpired.mock.calls.length).toBeGreaterThanOrEqual(3);
        for (const call of files.findExpired.mock.calls) {
            expect(call[2]).toBe(PURGE_BATCH_SIZE);
        }
        expect([...files.byId.values()].every((file) => file.isDeleted())).toBe(true);
    });

    it('goes past a whole batch of failing files to the rest', async () => {
        const total = PURGE_BATCH_SIZE + 10;
        const seeded: StoredFile[] = [];
        for (let index = 0; index < total; index += 1) {
            seeded.push(seed('application/pdf', new Date(NOW.getTime() + index * 1000)));
        }
        const brokenKeys = new Set(seeded.slice(0, PURGE_BATCH_SIZE).map((f) => f.storageKey));
        storage.delete.mockImplementation((key: string) => {
            if (brokenKeys.has(key)) return Promise.reject(new Error('storage is down'));
            storage.objects.delete(key);
            return Promise.resolve();
        });

        const result = await purge.execute(daysAfter(NOW, 31));

        expect(result).toEqual({ deleted: 10, failed: PURGE_BATCH_SIZE });
        expect(storage.delete).toHaveBeenCalledTimes(total);
    });

    it('publishes file.deleted with the retention cause in the same transaction', async () => {
        const file = seed('audio/mpeg');

        await purge.execute(daysAfter(NOW, 8));

        expect(events.published).toHaveLength(1);
        const [event] = events.published;
        expect(event).toBeInstanceOf(FileDeletedEvent);
        if (!(event instanceof FileDeletedEvent)) return;
        expect(event.fileId).toBe(file.id);
        expect(event.cause).toBe('retention');
        expect(events.publishedInTransaction).toEqual([true]);
    });

    it('re-reads the file under a lock and skips it when it is no longer expired', async () => {
        const file = seed('audio/mpeg');
        const snapshot = StoredFile.restore({
            id: file.id,
            ownerId: file.ownerId,
            name: file.name,
            mediaType: file.mediaType,
            sizeBytes: file.sizeBytes,
            storageKey: file.storageKey,
            status: file.status,
            retention: file.retention,
            uploadedAt: file.uploadedAt,
            deletedAt: null,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
        });
        files.findExpired.mockResolvedValueOnce([snapshot]);
        // Владелец повторил расшифровку: удержание продлено после выборки.
        file.hold(daysAfter(NOW, 8), policy);

        const result = await purge.execute(daysAfter(NOW, 8));

        expect(result).toEqual({ deleted: 0, failed: 0 });
        expect(files.lockedInTransaction).toEqual([true]);
        expect(storage.delete).not.toHaveBeenCalled();
        expect(files.byId.get(file.id)?.status).toBe('active');
    });

    it('logs a failed file with its id under err and a constant message', async () => {
        const file = seed('application/pdf');
        const failure = new Error('storage is down');
        storage.delete.mockRejectedValueOnce(failure);
        const warn = vi.spyOn(logger, 'warn');

        await purge.execute(daysAfter(NOW, 31));

        expect(warn).toHaveBeenCalledWith(
            { fileId: file.id, err: failure },
            'Expired file purge failed',
        );
    });
});
