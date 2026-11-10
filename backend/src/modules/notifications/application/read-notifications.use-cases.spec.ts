import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationNotFoundError } from '../domain/errors';
import type { Notification } from '../domain/notification';
import { GetUnreadCountUseCase } from './get-unread-count.use-case';
import { ListNotificationsUseCase } from './list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from './mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './mark-notification-read.use-case';
import { toNotificationDto } from './notification-view';
import {
    FixedClock,
    InMemoryNotificationRepository,
    makeNotification,
    NOW,
    RecordingRealtimeEmitter,
    silentLogger,
} from './test-doubles';

const BORIS = { userId: 'boris' };
const CAROL = { userId: 'carol' };

describe('notification read use-cases', () => {
    let notifications: InMemoryNotificationRepository;
    let clock: FixedClock;
    let emitter: RecordingRealtimeEmitter;

    async function store(...items: Notification[]): Promise<void> {
        await notifications.insertIgnoringDuplicates(items);
    }

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        clock = new FixedClock();
        emitter = new RecordingRealtimeEmitter();
    });

    describe('ListNotificationsUseCase', () => {
        let useCase: ListNotificationsUseCase;

        beforeEach(() => {
            useCase = new ListNotificationsUseCase(notifications);
        });

        it('returns a page of own notifications, newest first, with the total', async () => {
            const own = Array.from({ length: 5 }, () => makeNotification());
            await store(...own, makeNotification({ recipientId: 'carol' }));
            const newestFirst = [...own].reverse();

            const first = await useCase.execute(BORIS, { limit: 2, page: 0, unreadOnly: false });
            const last = await useCase.execute(BORIS, { limit: 2, page: 2, unreadOnly: false });

            expect(first).toEqual({
                items: newestFirst.slice(0, 2).map(toNotificationDto),
                total: 5,
                limit: 2,
                page: 0,
            });
            expect(last.items.map((item) => item.id)).toEqual([newestFirst[4]?.id]);
            expect(last.total).toBe(5);
        });

        it('returns only unread notifications when asked', async () => {
            const read = makeNotification();
            const unread = makeNotification();
            await store(read, unread);
            read.markAsRead(NOW);

            const page = await useCase.execute(BORIS, { limit: 20, page: 0, unreadOnly: true });

            expect(page.items.map((item) => item.id)).toEqual([unread.id]);
            expect(page.total).toBe(1);
        });

        it('never returns notifications of other users', async () => {
            await store(makeNotification({ recipientId: 'carol' }));

            const page = await useCase.execute(BORIS, { limit: 20, page: 0, unreadOnly: false });

            expect(page).toEqual({ items: [], total: 0, limit: 20, page: 0 });
        });

        it('maps notifications to DTOs with ISO dates', async () => {
            const notification = makeNotification();
            await store(notification);
            notification.markAsRead(NOW);

            const [dto] = (await useCase.execute(BORIS, { limit: 20, page: 0, unreadOnly: false }))
                .items;

            expect(dto).toEqual({
                id: notification.id,
                type: 'task.assigned',
                title: notification.content.title,
                body: notification.content.body,
                target: { type: 'task', id: notification.target.id },
                actorId: 'anna',
                createdAt: notification.createdAt.toISOString(),
                readAt: NOW.toISOString(),
            });
        });
    });

    describe('GetUnreadCountUseCase', () => {
        it('counts unread notifications of the actor only', async () => {
            const own = [makeNotification(), makeNotification(), makeNotification()];
            await store(...own, makeNotification({ recipientId: 'carol' }));
            own[0].markAsRead(NOW);

            const useCase = new GetUnreadCountUseCase(notifications);

            expect(await useCase.execute(BORIS)).toEqual({ unreadCount: 2 });
            expect(await useCase.execute({ userId: 'nobody' })).toEqual({ unreadCount: 0 });
        });
    });

    describe('MarkNotificationReadUseCase', () => {
        let useCase: MarkNotificationReadUseCase;

        beforeEach(() => {
            useCase = new MarkNotificationReadUseCase(
                notifications,
                clock,
                emitter,
                silentLogger(),
            );
        });

        it('marks the notification read and returns the remaining unread count', async () => {
            const target = makeNotification();
            await store(target, makeNotification());

            const result = await useCase.execute(BORIS, target.id);

            expect(result).toEqual({ unreadCount: 1 });
            expect(target.readAt).toEqual(NOW);
        });

        it('sends notification.read with the id and the unread count to the actor', async () => {
            const target = makeNotification();
            await store(target);

            await useCase.execute(BORIS, target.id);

            expect(emitter.emitted).toEqual([
                {
                    userId: 'boris',
                    event: {
                        name: 'notification.read',
                        payload: { notificationIds: [target.id], unreadCount: 0 },
                    },
                },
            ]);
        });

        it('keeps the read time when the notification is marked again', async () => {
            const target = makeNotification();
            await store(target);
            await useCase.execute(BORIS, target.id);
            clock.current = new Date(NOW.getTime() + 60_000);

            const result = await useCase.execute(BORIS, target.id);

            expect(result).toEqual({ unreadCount: 0 });
            expect(target.readAt).toEqual(NOW);
        });

        it('throws NotificationNotFoundError for a foreign notification and leaves it unread', async () => {
            const foreign = makeNotification({ recipientId: 'carol' });
            await store(foreign);

            await expect(useCase.execute(BORIS, foreign.id)).rejects.toBeInstanceOf(
                NotificationNotFoundError,
            );
            expect(foreign.readAt).toBeNull();
            expect(emitter.emitted).toEqual([]);
        });

        it('throws NotificationNotFoundError for a missing notification', async () => {
            await expect(useCase.execute(BORIS, 'missing')).rejects.toBeInstanceOf(
                NotificationNotFoundError,
            );
        });

        it('still answers when the realtime emitter fails', async () => {
            const target = makeNotification();
            await store(target);
            emitter.failure = new Error('redis is down');

            expect(await useCase.execute(BORIS, target.id)).toEqual({ unreadCount: 0 });
        });
    });

    describe('MarkAllNotificationsReadUseCase', () => {
        let useCase: MarkAllNotificationsReadUseCase;

        beforeEach(() => {
            useCase = new MarkAllNotificationsReadUseCase(
                notifications,
                clock,
                emitter,
                silentLogger(),
            );
        });

        it('marks all own notifications read and returns unreadCount 0', async () => {
            const own = [makeNotification(), makeNotification()];
            const foreign = makeNotification({ recipientId: 'carol' });
            await store(...own, foreign);

            const result = await useCase.execute(BORIS);

            expect(result).toEqual({ unreadCount: 0 });
            expect(own.map((notification) => notification.readAt)).toEqual([NOW, NOW]);
            expect(foreign.readAt).toBeNull();
            expect(await notifications.countUnread(CAROL.userId)).toBe(1);
        });

        it('sends notification.read with all: true to the actor', async () => {
            await store(makeNotification());

            await useCase.execute(BORIS);

            expect(emitter.emitted).toEqual([
                {
                    userId: 'boris',
                    event: { name: 'notification.read', payload: { all: true, unreadCount: 0 } },
                },
            ]);
        });

        it('returns and sends the actual unread count when a notification arrives meanwhile', async () => {
            await store(makeNotification());
            const markAllRead = notifications.markAllRead.bind(notifications);
            notifications.markAllRead = async (recipientId, now) => {
                await markAllRead(recipientId, now);
                await store(makeNotification());
            };

            const result = await useCase.execute(BORIS);

            expect(result).toEqual({ unreadCount: 1 });
            expect(emitter.emitted).toEqual([
                {
                    userId: 'boris',
                    event: { name: 'notification.read', payload: { all: true, unreadCount: 1 } },
                },
            ]);
        });

        it('still answers when the realtime emitter fails', async () => {
            emitter.failure = new Error('redis is down');

            expect(await useCase.execute(BORIS)).toEqual({ unreadCount: 0 });
        });
    });
});
