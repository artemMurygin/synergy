import type { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
    ChatSystemMessagePostedEvent,
    chatSystemMessagePostedPayloadSchema,
    type ChatSystemMessagePostedPayload,
} from './chat-system-message-posted.event';

export function registerAssistantEvents(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
        eventClass: ChatSystemMessagePostedEvent,
        schema: chatSystemMessagePostedPayloadSchema,
        toPayload: (event): ChatSystemMessagePostedPayload => ({
            ownerId: event.ownerId,
            messageId: event.messageId,
            topic: event.topic,
            subject: event.subject,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new ChatSystemMessagePostedEvent({ id, aggregateId, metadata, ...payload }),
    });
}
