import { describe, expect, it } from 'vitest';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
    ChatSystemMessagePostedEvent,
} from './chat-system-message-posted.event';
import { registerAssistantEvents } from './register-assistant-events';

describe('ChatSystemMessagePostedEvent', () => {
    it('round-trips through the outbox registry without the message text', () => {
        const registry = new DomainEventRegistry();
        registerAssistantEvents(registry);
        const event = new ChatSystemMessagePostedEvent({
            aggregateId: 'session-1',
            ownerId: 'owner-1',
            messageId: 42,
            topic: 'meeting-transcript.failed',
            subject: { fileId: 'rec-1', fileName: 'встреча.m4a' },
        });

        const serialized = registry.serialize(event);
        expect(serialized.eventType).toBe(CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE);
        expect(serialized.eventType).toBe('chat.system-message-posted');
        expect(serialized.payload).toEqual({
            ownerId: 'owner-1',
            messageId: 42,
            topic: 'meeting-transcript.failed',
            subject: { fileId: 'rec-1', fileName: 'встреча.m4a' },
        });

        const restored = registry.restore({
            id: event.id,
            eventType: serialized.eventType,
            aggregateId: event.aggregateId,
            payload: serialized.payload,
            metadata: event.metadata,
        }) as ChatSystemMessagePostedEvent;
        expect(restored).toBeInstanceOf(ChatSystemMessagePostedEvent);
        expect(restored.sessionId).toBe('session-1');
        expect(restored.subject).toEqual({ fileId: 'rec-1', fileName: 'встреча.m4a' });
    });
});
