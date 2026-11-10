import { describe, expect, it } from 'vitest';
import { RequestContext } from '../../../shared/context/request-context';
import { InvalidNotificationStateError } from './errors';
import { NotificationCreatedEvent } from './events/notification-created.event';
import { Notification } from './notification';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

const CREATED_AT = new Date('2026-03-01T10:00:00Z');
const LATER = new Date('2026-03-01T10:05:00Z');
const MUCH_LATER = new Date('2026-03-02T09:00:00Z');

const draft: NotificationDraft = {
    recipientId: 'boris',
    type: 'task.assigned',
    content: NotificationContent.of({
        title: 'Вам назначена задача',
        body: 'anna назначил вас ответственным: Подготовить КП',
    }),
    target: NotificationTarget.of({ type: 'task', id: 'task-1' }),
    actorId: 'anna',
};

function created(): Notification {
    return Notification.create({
        id: 'n-1',
        draft,
        sourceEventId: 'event-1',
        now: CREATED_AT,
    });
}

function restored(readAt: Date | null): Notification {
    return Notification.restore({
        id: 'n-2',
        recipientId: 'boris',
        type: 'task.assigned',
        content: draft.content,
        target: draft.target,
        actorId: null,
        sourceEventId: 'event-2',
        createdAt: CREATED_AT,
        readAt,
    });
}

describe('Notification.create', () => {
    it('builds an unread notification from a draft', () => {
        const notification = created();

        expect(notification.id).toBe('n-1');
        expect(notification.recipientId).toBe('boris');
        expect(notification.type).toBe('task.assigned');
        expect(notification.content.equals(draft.content)).toBe(true);
        expect(notification.target.equals(draft.target)).toBe(true);
        expect(notification.actorId).toBe('anna');
        expect(notification.sourceEventId).toBe('event-1');
        expect(notification.createdAt).toEqual(CREATED_AT);
        expect(notification.readAt).toBeNull();
        expect(notification.isRead()).toBe(false);
    });

    it('raises exactly one NotificationCreatedEvent for the recipient', () => {
        const events = created().pullDomainEvents();

        expect(events).toHaveLength(1);
        const [event] = events;
        expect(event).toBeInstanceOf(NotificationCreatedEvent);
        if (!(event instanceof NotificationCreatedEvent)) return;
        expect(event.aggregateId).toBe('n-1');
        expect(event.notificationId).toBe('n-1');
        expect(event.recipientId).toBe('boris');
    });

    it('stamps the event with the creation time, request correlation id and source event', () => {
        const notification = RequestContext.run(
            { requestId: 'req-1', correlationId: 'corr-7' },
            created,
        );

        const [event] = notification.pullDomainEvents();

        expect(event.metadata).toMatchObject({
            timestamp: CREATED_AT.getTime(),
            correlationId: 'corr-7',
            causationId: 'event-1',
        });
    });

    it('keeps a missing actor as null', () => {
        const notification = Notification.create({
            id: 'n-3',
            draft: { ...draft, actorId: null },
            sourceEventId: 'event-3',
            now: CREATED_AT,
        });

        expect(notification.actorId).toBeNull();
    });
});

describe('Notification.restore', () => {
    it('keeps the persisted state and raises no events', () => {
        const notification = restored(LATER);

        expect(notification.readAt).toEqual(LATER);
        expect(notification.isRead()).toBe(true);
        expect(notification.actorId).toBeNull();
        expect(notification.pullDomainEvents()).toEqual([]);
    });

    it('refuses a read time before the creation time', () => {
        expect(() => restored(new Date(CREATED_AT.getTime() - 1))).toThrow(
            InvalidNotificationStateError,
        );
    });
});

describe('Notification.markAsRead', () => {
    it('sets the read time and reports the change', () => {
        const notification = created();

        expect(notification.markAsRead(LATER)).toBe(true);
        expect(notification.readAt).toEqual(LATER);
        expect(notification.isRead()).toBe(true);
    });

    it('sets the read time only once and returns false on repeat', () => {
        const notification = created();
        notification.markAsRead(LATER);

        expect(notification.markAsRead(MUCH_LATER)).toBe(false);
        expect(notification.readAt).toEqual(LATER);
    });

    it('returns false for a notification restored as read', () => {
        const notification = restored(LATER);

        expect(notification.markAsRead(MUCH_LATER)).toBe(false);
        expect(notification.readAt).toEqual(LATER);
    });

    it('never records a read time earlier than the creation time', () => {
        const notification = created();

        expect(notification.markAsRead(new Date(CREATED_AT.getTime() - 5_000))).toBe(true);
        expect(notification.readAt).toEqual(CREATED_AT);
    });
});
