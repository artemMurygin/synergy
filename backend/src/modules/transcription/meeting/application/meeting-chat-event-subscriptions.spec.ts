import { describe, expect, it, vi } from 'vitest';
import { DomainEventRegistry } from '../../../../shared/outbox/application/domain-event-registry';
import { registerMeetingTranscriptEvents } from '../contracts/register-meeting-transcript-events';
import { MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE } from '../domain/events/meeting-transcript-completed.event';
import { MEETING_TRANSCRIPT_FAILED_EVENT_TYPE } from '../domain/events/meeting-transcript-failed.event';
import { MeetingChatEventSubscriptions } from './meeting-chat-event-subscriptions';
import {
    NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS,
    type NotifyChatOnTranscriptFinished,
} from './notify-chat-on-transcript-finished.subscriber';

describe('MeetingChatEventSubscriptions', () => {
    it('subscribes the chat notifier to meeting-transcript.completed and meeting-transcript.failed', () => {
        const registry = new DomainEventRegistry();
        registerMeetingTranscriptEvents(registry);
        const completed = {
            name: NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.completed,
            handle: vi.fn(),
        };
        const failed = { name: NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.failed, handle: vi.fn() };
        const notifier = {
            subscriberFor: vi.fn((type: string) =>
                type === MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE ? completed : failed,
            ),
        } as unknown as NotifyChatOnTranscriptFinished;

        new MeetingChatEventSubscriptions(registry, notifier).onModuleInit();

        expect(
            registry.findSubscriber(
                MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
                NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.completed,
            ),
        ).toBe(completed);
        expect(
            registry.findSubscriber(
                MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
                NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.failed,
            ),
        ).toBe(failed);
    });
});
