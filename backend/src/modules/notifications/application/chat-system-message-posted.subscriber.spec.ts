import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSystemMessagePostedEvent } from '../../assistant/contracts/chat-system-message-posted.event';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import {
    CHAT_SYSTEM_MESSAGE_SUBSCRIBER,
    ChatSystemMessagePostedSubscriber,
} from './chat-system-message-posted.subscriber';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';
import {
    FixedClock,
    InMemoryNotificationRepository,
    RecordingCreationMetrics,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

const CHAT_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const EVENT_ID = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a';
const TRANSCRIPT_TEXT = 'Спикер 1: обсудили бюджет на следующий квартал';

function posted(
    topic: 'meeting-transcript.ready' | 'meeting-transcript.failed',
): ChatSystemMessagePostedEvent {
    return new ChatSystemMessagePostedEvent({
        id: EVENT_ID,
        aggregateId: CHAT_ID,
        ownerId: 'owner-id',
        messageId: 7,
        topic,
        subject: { fileId: 'file-1', fileName: 'встреча.m4a' },
    });
}

describe('ChatSystemMessagePostedSubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let events: RecordingEventPublisher;
    let subscriber: ChatSystemMessagePostedSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        const transactions = new SnapshotTransactionRunner([notifications]);
        events = new RecordingEventPublisher(transactions);
        subscriber = new ChatSystemMessagePostedSubscriber(
            new CreateNotificationsUseCase(
                notifications,
                new FixedClock(),
                transactions,
                events,
                new RecordingCreationMetrics(),
            ),
        );
    });

    it('is registered under a stable subscriber name', () => {
        expect(CHAT_SYSTEM_MESSAGE_SUBSCRIBER).toBe('notifications.chat-system-message');
        expect(subscriber.name).toBe(CHAT_SYSTEM_MESSAGE_SUBSCRIBER);
    });

    it('creates one unread meeting-transcript.ready notification linked to the chat', async () => {
        await subscriber.handle(posted('meeting-transcript.ready'));

        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        const [notification] = stored;
        expect(notification.recipientId).toBe('owner-id');
        expect(notification.type).toBe('meeting-transcript.ready');
        expect(notification.target.type).toBe('chat');
        expect(notification.target.id).toBe(CHAT_ID);
        expect(notification.content.body).toContain('встреча.m4a');
        expect(notification.readAt).toBeNull();
        expect(notification.sourceEventId).toBe(EVENT_ID);
        expect(events.published).toHaveLength(1);
        expect(events.published[0]).toBeInstanceOf(NotificationCreatedEvent);
    });

    it('creates meeting-transcript.failed for a failed transcription', async () => {
        await subscriber.handle(posted('meeting-transcript.failed'));

        const [notification] = [...notifications.byId.values()];
        expect(notification.type).toBe('meeting-transcript.failed');
        expect(notification.content.title).toBe('Не удалось расшифровать запись: встреча.m4a');
    });

    it('never puts the transcript text into the notification', async () => {
        await subscriber.handle(posted('meeting-transcript.ready'));

        const [notification] = [...notifications.byId.values()];
        expect(`${notification.content.title} ${notification.content.body}`).not.toContain(
            TRANSCRIPT_TEXT,
        );
        expect(notification.content.body).toBe('встреча.m4a');
    });

    it('does not duplicate the notification when the event is handled again', async () => {
        await subscriber.handle(posted('meeting-transcript.ready'));
        await subscriber.handle(posted('meeting-transcript.ready'));

        expect(notifications.byId.size).toBe(1);
        expect(events.published).toHaveLength(1);
    });

    it('rejects an event of another type', async () => {
        const unexpected = new TaskCreatedEvent({
            aggregateId: 't-1',
            title: 'КП',
            creatorId: 'anna',
            assigneeId: null,
        });

        await expect(subscriber.handle(unexpected)).rejects.toBeInstanceOf(
            UnexpectedSourceEventError,
        );
    });
});
