import type { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    FILE_DELETED_EVENT_TYPE,
    FileDeletedEvent,
    fileDeletedPayloadSchema,
    type FileDeletedPayload,
} from '../domain/events/file-deleted.event';
import {
    FILE_UPLOADED_EVENT_TYPE,
    FileUploadedEvent,
    fileUploadedPayloadSchema,
    type FileUploadedPayload,
} from '../domain/events/file-uploaded.event';

export function registerFileEvents(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: FILE_UPLOADED_EVENT_TYPE,
        eventClass: FileUploadedEvent,
        schema: fileUploadedPayloadSchema,
        toPayload: (event): FileUploadedPayload => ({
            ownerId: event.ownerId,
            kind: event.kind,
            mediaType: event.mediaType,
            sizeBytes: event.sizeBytes,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new FileUploadedEvent({ id, aggregateId, metadata, ...payload }),
    });
    registry.registerEvent({
        eventType: FILE_DELETED_EVENT_TYPE,
        eventClass: FileDeletedEvent,
        schema: fileDeletedPayloadSchema,
        toPayload: (event): FileDeletedPayload => ({
            ownerId: event.ownerId,
            kind: event.kind,
            cause: event.cause,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new FileDeletedEvent({ id, aggregateId, metadata, ...payload }),
    });
}
