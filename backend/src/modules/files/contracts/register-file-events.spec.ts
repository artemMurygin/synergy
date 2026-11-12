import { describe, expect, it } from 'vitest';
import {
    DomainEventRegistry,
    InvalidEventPayloadError,
} from '../../../shared/outbox/application/domain-event-registry';
import { FILE_DELETED_EVENT_TYPE, FileDeletedEvent } from '../domain/events/file-deleted.event';
import { FILE_UPLOADED_EVENT_TYPE, FileUploadedEvent } from '../domain/events/file-uploaded.event';
import { registerFileEvents } from './register-file-events';

const metadata = { timestamp: 1_700_000_000_000, userId: 'owner' };

function uploadedEvent(): FileUploadedEvent {
    return new FileUploadedEvent({
        aggregateId: '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a',
        ownerId: 'owner',
        kind: 'recording',
        mediaType: 'audio/mpeg',
        sizeBytes: 1024,
        metadata,
    });
}

function registry(): DomainEventRegistry {
    const events = new DomainEventRegistry();
    registerFileEvents(events);
    return events;
}

describe('file.uploaded registration', () => {
    it('serializes the event without the file name', () => {
        const serialized = registry().serialize(uploadedEvent());

        expect(serialized.eventType).toBe(FILE_UPLOADED_EVENT_TYPE);
        expect(serialized.payload).toEqual({
            ownerId: 'owner',
            kind: 'recording',
            mediaType: 'audio/mpeg',
            sizeBytes: 1024,
        });
    });

    it('restores an equal event', () => {
        const events = registry();
        const original = uploadedEvent();
        const serialized = events.serialize(original);

        const restored = events.restore({
            id: original.id,
            eventType: serialized.eventType,
            aggregateId: original.aggregateId,
            payload: JSON.parse(JSON.stringify(serialized.payload)),
            metadata: JSON.parse(JSON.stringify(original.metadata)),
        });

        expect(restored).toBeInstanceOf(FileUploadedEvent);
        if (!(restored instanceof FileUploadedEvent)) return;
        expect(restored.id).toBe(original.id);
        expect(restored.fileId).toBe(original.fileId);
        expect(restored.ownerId).toBe('owner');
        expect(restored.kind).toBe('recording');
        expect(restored.mediaType).toBe('audio/mpeg');
        expect(restored.sizeBytes).toBe(1024);
        expect(restored.metadata).toEqual(original.metadata);
    });

    it.each([
        ['an unknown kind', { ownerId: 'o', kind: 'video', mediaType: 'x/y', sizeBytes: 1 }],
        ['a zero size', { ownerId: 'o', kind: 'document', mediaType: 'x/y', sizeBytes: 0 }],
        ['a missing owner', { kind: 'document', mediaType: 'x/y', sizeBytes: 1 }],
    ])('rejects a payload with %s', (_case, payload) => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: FILE_UPLOADED_EVENT_TYPE,
                aggregateId: 'f1',
                payload,
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('file.deleted registration', () => {
    const deleted = (): FileDeletedEvent =>
        new FileDeletedEvent({
            aggregateId: '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a',
            ownerId: 'owner',
            kind: 'recording',
            cause: 'retention',
            metadata,
        });

    it('serializes and restores the event without the file name', () => {
        const events = registry();
        const original = deleted();
        const serialized = events.serialize(original);

        expect(serialized.eventType).toBe(FILE_DELETED_EVENT_TYPE);
        expect(serialized.payload).toEqual({
            ownerId: 'owner',
            kind: 'recording',
            cause: 'retention',
        });
        const restored = events.restore({
            id: original.id,
            eventType: serialized.eventType,
            aggregateId: original.aggregateId,
            payload: JSON.parse(JSON.stringify(serialized.payload)),
            metadata: JSON.parse(JSON.stringify(original.metadata)),
        });
        expect(restored).toBeInstanceOf(FileDeletedEvent);
        if (!(restored instanceof FileDeletedEvent)) return;
        expect(restored.fileId).toBe(original.fileId);
        expect(restored.cause).toBe('retention');
        expect(restored.kind).toBe('recording');
    });

    it('rejects an unknown cause', () => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: FILE_DELETED_EVENT_TYPE,
                aggregateId: 'f1',
                payload: { ownerId: 'o', kind: 'document', cause: 'virus' },
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});
