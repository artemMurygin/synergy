import { describe, expect, it } from 'vitest';
import { FileDeletedEvent } from './events/file-deleted.event';
import { FileUploadedEvent } from './events/file-uploaded.event';
import { FileGoneError, InvalidStoredFileError } from './errors';
import { FileName } from './file-name';
import { MediaType } from './media-type';
import { Retention } from './retention';
import { RetentionPolicy } from './retention-policy';
import { StoredFile, type UploadStoredFileInput } from './stored-file';

const DAY = 24 * 60 * 60 * 1000;
const uploadedAt = new Date('2026-03-01T09:00:00.000Z');
const policy = new RetentionPolicy({ documentDays: 30, recordingDays: 1, maxHoldDays: 7 });

function input(
    mime: string,
    overrides: Partial<UploadStoredFileInput> = {},
): UploadStoredFileInput {
    return {
        id: '0b9a4f8e-7a51-4a8e-9c1e-1f2d3c4b5a69',
        ownerId: 'owner-1',
        name: FileName.of('встреча.m4a'),
        mediaType: MediaType.of(mime),
        sizeBytes: 2 * 1024 * 1024,
        storageKey: 'owner-1/0b9a4f8e-7a51-4a8e-9c1e-1f2d3c4b5a69',
        now: uploadedAt,
        ...overrides,
    };
}

function recording(): StoredFile {
    const file = StoredFile.upload(input('audio/mp4'), policy);
    file.pullDomainEvents();
    return file;
}

function document(): StoredFile {
    const file = StoredFile.upload(
        input('application/pdf', { name: FileName.of('Отчёт.pdf') }),
        policy,
    );
    file.pullDomainEvents();
    return file;
}

const at = (days: number): Date => new Date(uploadedAt.getTime() + days * DAY);

describe('StoredFile.upload', () => {
    it('creates an active document with a 30 day expiry', () => {
        const file = StoredFile.upload(
            input('application/pdf', { name: FileName.of('Отчёт.pdf') }),
            policy,
        );

        expect(file.status).toBe('active');
        expect(file.kind).toBe('document');
        expect(file.name.value).toBe('Отчёт.pdf');
        expect(file.uploadedAt).toEqual(uploadedAt);
        expect(file.deletedAt).toBeNull();
        expect(file.retention.expiresAt).toEqual(at(30));
        expect(file.retention.heldUntil).toBeNull();
        expect(file.isAwaitingProcessing()).toBe(false);
    });

    it('holds a recording without an expiry', () => {
        const file = StoredFile.upload(input('audio/mp4'), policy);

        expect(file.kind).toBe('recording');
        expect(file.retention.heldUntil).toEqual(at(7));
        expect(file.retention.expiresAt).toBeNull();
        expect(file.isAwaitingProcessing()).toBe(true);
    });

    it('records FileUploaded without the file name', () => {
        const file = StoredFile.upload(input('audio/mp4'), policy);
        const events = file.pullDomainEvents();

        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event).toBeInstanceOf(FileUploadedEvent);
        if (!(event instanceof FileUploadedEvent)) return;
        expect(event.fileId).toBe(file.id);
        expect(event.ownerId).toBe('owner-1');
        expect(event.kind).toBe('recording');
        expect(event.mediaType).toBe('audio/mp4');
        expect(event.sizeBytes).toBe(2 * 1024 * 1024);
        expect(event.metadata.timestamp).toBe(uploadedAt.getTime());
        expect(event.metadata.userId).toBe('owner-1');
        expect(JSON.stringify(event)).not.toContain('встреча');
        expect(Object.keys(event)).not.toContain('name');
    });

    it.each([[0], [-1], [1.5], [Number.NaN]])('rejects size %d', (sizeBytes) => {
        expect(() => StoredFile.upload(input('audio/mp4', { sizeBytes }), policy)).toThrow(
            InvalidStoredFileError,
        );
    });

    it.each([['ownerId'], ['storageKey']])('rejects an empty %s', (field) => {
        expect(() => StoredFile.upload(input('audio/mp4', { [field]: '' }), policy)).toThrow(
            InvalidStoredFileError,
        );
    });
});

describe('StoredFile.releaseHold', () => {
    it('expires a recording one day after release', () => {
        const file = recording();
        const releasedAt = new Date('2026-03-02T12:00:00.000Z');

        file.releaseHold(releasedAt, policy);

        expect(file.retention.expiresAt).toEqual(new Date('2026-03-03T12:00:00.000Z'));
        expect(file.retention.heldUntil).toBeNull();
        expect(file.isAwaitingProcessing()).toBe(false);
    });

    it('changes nothing when repeated', () => {
        const file = recording();
        file.releaseHold(at(1), policy);
        const before = file.retention;

        file.releaseHold(at(3), policy);

        expect(file.retention.equals(before)).toBe(true);
        expect(file.retention.expiresAt).toEqual(at(2));
    });

    it('changes nothing for a document', () => {
        const file = document();

        file.releaseHold(at(1), policy);

        expect(file.retention.expiresAt).toEqual(at(30));
    });

    it('changes nothing for a deleted file', () => {
        const file = recording();
        file.markDeleted(at(1), 'owner');

        file.releaseHold(at(2), policy);

        expect(file.retention.heldUntil).toEqual(at(7));
        expect(file.status).toBe('deleted');
    });
});

describe('StoredFile.hold', () => {
    it('holds a released recording again', () => {
        const file = recording();
        file.releaseHold(at(1), policy);

        file.hold(at(1.5), policy);

        expect(file.retention.heldUntil).toEqual(at(8.5));
        expect(file.retention.expiresAt).toBeNull();
        expect(file.isAwaitingProcessing()).toBe(true);
    });

    it('throws FileGoneError for a deleted file', () => {
        const file = recording();
        file.markDeleted(at(1), 'owner');

        expect(() => {
            file.hold(at(2), policy);
        }).toThrow(FileGoneError);
    });

    it('refuses to hold a document', () => {
        const file = document();

        expect(() => {
            file.hold(at(1), policy);
        }).toThrow(InvalidStoredFileError);
    });
});

describe('StoredFile.isExpired', () => {
    it('expires a document at its expiry', () => {
        const file = document();

        expect(file.isExpired(new Date(at(30).getTime() - 1), policy)).toBe(false);
        expect(file.isExpired(at(30), policy)).toBe(true);
    });

    it('expires a released recording at its expiry', () => {
        const file = recording();
        file.releaseHold(at(1), policy);

        expect(file.isExpired(new Date(at(2).getTime() - 1), policy)).toBe(false);
        expect(file.isExpired(at(2), policy)).toBe(true);
    });

    it('expires a stale hold one day after it ends', () => {
        const file = recording();

        expect(file.isExpired(at(7), policy)).toBe(false);
        expect(file.isExpired(new Date(at(8).getTime() - 1), policy)).toBe(false);
        expect(file.isExpired(at(8), policy)).toBe(true);
    });

    it('never reports a deleted file as expired', () => {
        const file = document();
        file.markDeleted(at(1), 'owner');

        expect(file.isExpired(at(100), policy)).toBe(false);
    });
});

describe('StoredFile.markDeleted', () => {
    it('marks the file deleted', () => {
        const file = document();

        file.markDeleted(at(31), 'owner');

        expect(file.status).toBe('deleted');
        expect(file.isDeleted()).toBe(true);
        expect(file.deletedAt).toEqual(at(31));
    });

    it('is idempotent', () => {
        const file = document();
        file.markDeleted(at(31), 'owner');

        file.markDeleted(at(40), 'owner');

        expect(file.status).toBe('deleted');
        expect(file.deletedAt).toEqual(at(31));
        expect(file.pullDomainEvents()).toHaveLength(1);
    });

    it('records a file.deleted event with the cause and without the name', () => {
        const file = recording();

        file.markDeleted(at(9), 'retention');

        const events = file.pullDomainEvents();
        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event).toBeInstanceOf(FileDeletedEvent);
        if (!(event instanceof FileDeletedEvent)) return;
        expect(event.fileId).toBe(file.id);
        expect(event.ownerId).toBe('owner-1');
        expect(event.kind).toBe('recording');
        expect(event.cause).toBe('retention');
        expect(event.metadata.timestamp).toBe(at(9).getTime());
    });
});

describe('StoredFile.restore', () => {
    const base = {
        id: 'f1',
        ownerId: 'owner-1',
        name: FileName.of('a.pdf'),
        mediaType: MediaType.of('application/pdf'),
        sizeBytes: 10,
        storageKey: 'owner-1/f1',
        uploadedAt,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
    };

    it('restores a deleted file without events', () => {
        const file = StoredFile.restore({
            ...base,
            status: 'deleted',
            retention: Retention.expiring(at(30)),
            deletedAt: at(31),
        });

        expect(file.isDeleted()).toBe(true);
        expect(file.pullDomainEvents()).toEqual([]);
    });

    it('rejects a document without an expiry', () => {
        expect(() =>
            StoredFile.restore({
                ...base,
                status: 'active',
                retention: Retention.heldUntil(at(7)),
                deletedAt: null,
            }),
        ).toThrow(InvalidStoredFileError);
    });

    it('rejects a status that disagrees with deletedAt', () => {
        expect(() =>
            StoredFile.restore({
                ...base,
                status: 'active',
                retention: Retention.expiring(at(30)),
                deletedAt: at(31),
            }),
        ).toThrow(InvalidStoredFileError);
        expect(() =>
            StoredFile.restore({
                ...base,
                status: 'deleted',
                retention: Retention.expiring(at(30)),
                deletedAt: null,
            }),
        ).toThrow(InvalidStoredFileError);
    });
});
