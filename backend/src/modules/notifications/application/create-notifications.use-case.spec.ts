import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import {
    FixedClock,
    InMemoryNotificationRepository,
    makeDraft,
    NOW,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

const SOURCE_EVENT_ID = '3f1c2a9e-0d4b-4c6e-8a7f-1b2c3d4e5f60';

describe('CreateNotificationsUseCase', () => {
    let notifications: InMemoryNotificationRepository;
    let transactions: SnapshotTransactionRunner;
    let events: RecordingEventPublisher;
    let useCase: CreateNotificationsUseCase;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        transactions = new SnapshotTransactionRunner([notifications]);
        events = new RecordingEventPublisher(transactions);
        useCase = new CreateNotificationsUseCase(
            notifications,
            new FixedClock(),
            transactions,
            events,
        );
    });

    it('stores the drafts as unread notifications of the source event', async () => {
        const draft = makeDraft({ recipientId: 'boris', actorId: 'anna' });

        const created = await useCase.execute(SOURCE_EVENT_ID, [draft]);

        expect(created).toHaveLength(1);
        const [notification] = created;
        expect(notifications.byId.get(notification.id)).toBe(notification);
        expect(notification.recipientId).toBe('boris');
        expect(notification.actorId).toBe('anna');
        expect(notification.sourceEventId).toBe(SOURCE_EVENT_ID);
        expect(notification.content.equals(draft.content)).toBe(true);
        expect(notification.target.equals(draft.target)).toBe(true);
        expect(notification.createdAt).toEqual(NOW);
        expect(notification.readAt).toBeNull();
    });

    it('inserts and publishes NotificationCreatedEvent inside one transaction', async () => {
        const created = await useCase.execute(SOURCE_EVENT_ID, [
            makeDraft({ recipientId: 'boris' }),
            makeDraft({ recipientId: 'carol' }),
        ]);

        expect(transactions.commits).toBe(1);
        expect(events.publishedInTransaction).toEqual([true]);
        expect(events.published).toHaveLength(2);
        for (const [index, event] of events.published.entries()) {
            expect(event).toBeInstanceOf(NotificationCreatedEvent);
            if (!(event instanceof NotificationCreatedEvent)) return;
            expect(event.notificationId).toBe(created[index]?.id);
            expect(event.recipientId).toBe(created[index]?.recipientId);
            expect(event.metadata.causationId).toBe(SOURCE_EVENT_ID);
        }
    });

    it('creates no duplicates and no events when the same source event is processed again', async () => {
        await useCase.execute(SOURCE_EVENT_ID, [makeDraft({ recipientId: 'boris' })]);
        events.published.length = 0;

        const repeated = await useCase.execute(SOURCE_EVENT_ID, [
            makeDraft({ recipientId: 'boris' }),
        ]);

        expect(repeated).toEqual([]);
        expect(notifications.byId.size).toBe(1);
        expect(events.published).toEqual([]);
    });

    it('publishes events only for the notifications actually inserted', async () => {
        await useCase.execute(SOURCE_EVENT_ID, [makeDraft({ recipientId: 'boris' })]);
        events.published.length = 0;

        const created = await useCase.execute(SOURCE_EVENT_ID, [
            makeDraft({ recipientId: 'boris' }),
            makeDraft({ recipientId: 'carol' }),
        ]);

        expect(created.map((notification) => notification.recipientId)).toEqual(['carol']);
        expect(events.published).toHaveLength(1);
        const [event] = events.published;
        expect(event).toBeInstanceOf(NotificationCreatedEvent);
        if (!(event instanceof NotificationCreatedEvent)) return;
        expect(event.recipientId).toBe('carol');
    });

    it('rolls the notifications back when publishing fails', async () => {
        events.failure = new Error('outbox is down');

        await expect(
            useCase.execute(SOURCE_EVENT_ID, [makeDraft({ recipientId: 'boris' })]),
        ).rejects.toThrow('outbox is down');

        expect(transactions.rollbacks).toBe(1);
        expect(notifications.byId.size).toBe(0);
    });

    it('does nothing for an empty list of drafts', async () => {
        expect(await useCase.execute(SOURCE_EVENT_ID, [])).toEqual([]);
        expect(events.published).toEqual([]);
    });
});
