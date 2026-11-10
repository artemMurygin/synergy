import type { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    NOTIFICATION_CREATED_EVENT_TYPE,
    NotificationCreatedEvent,
    notificationCreatedPayloadSchema,
    type NotificationCreatedPayload,
} from '../domain/events/notification-created.event';

export function registerNotificationEvents(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: NOTIFICATION_CREATED_EVENT_TYPE,
        eventClass: NotificationCreatedEvent,
        schema: notificationCreatedPayloadSchema,
        toPayload: (event): NotificationCreatedPayload => ({ recipientId: event.recipientId }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new NotificationCreatedEvent({ id, aggregateId, metadata, ...payload }),
    });
}
