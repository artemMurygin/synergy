import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetUnreadCountUseCase } from '../../application/get-unread-count.use-case';
import { ListNotificationsUseCase } from '../../application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/mark-notification-read.use-case';
import type { NotificationDto } from '../../application/notification-view';
import { NotificationNotFoundError } from '../../domain/errors';
import { NotificationsController } from './notifications.controller';
import {
    type NotificationsHttpFixture,
    startNotificationsHttpFixture,
} from './testing/notifications-http-fixture';

const USER_ID = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const NOTIFICATION_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const TASK_ID = '7a1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const list = { execute: vi.fn() };
const unreadCount = { execute: vi.fn() };
const markRead = { execute: vi.fn() };
const markAllRead = { execute: vi.fn() };

const dto: NotificationDto = {
    id: NOTIFICATION_ID,
    type: 'task.assigned',
    title: 'Вам назначена задача',
    body: 'anna назначил вас ответственным: Подготовить КП',
    target: { type: 'task', id: TASK_ID },
    actorId: USER_ID,
    createdAt: '2026-11-06T10:00:00.000Z',
    readAt: null,
};

describe('NotificationsController', () => {
    let fixture: NotificationsHttpFixture;

    beforeAll(async () => {
        fixture = await startNotificationsHttpFixture({
            controllers: [NotificationsController],
            providers: [
                { provide: ListNotificationsUseCase, useValue: list },
                { provide: GetUnreadCountUseCase, useValue: unreadCount },
                { provide: MarkNotificationReadUseCase, useValue: markRead },
                { provide: MarkAllNotificationsReadUseCase, useValue: markAllRead },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        list.execute.mockResolvedValue({ items: [dto], total: 30, limit: 20, page: 0 });
        unreadCount.execute.mockResolvedValue({ unreadCount: 3 });
        markRead.execute.mockResolvedValue({ unreadCount: 2 });
        markAllRead.execute.mockResolvedValue({ unreadCount: 0 });
    });

    const asUser = (): Record<string, string> => fixture.bearer(USER_ID);

    describe('GET /notifications', () => {
        it('answers 200 with the page of the token user and default pagination', async () => {
            const response = await fixture.call('GET', '/notifications', asUser());

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ items: [dto], total: 30, limit: 20, page: 0 });
            expect(list.execute).toHaveBeenCalledWith(
                { userId: USER_ID },
                { limit: 20, page: 0, unreadOnly: false },
            );
        });

        it('passes limit, page and unreadOnly', async () => {
            const response = await fixture.call(
                'GET',
                '/notifications?limit=5&page=2&unreadOnly=true',
                asUser(),
            );

            expect(response.status).toBe(200);
            expect(list.execute).toHaveBeenCalledWith(
                { userId: USER_ID },
                { limit: 5, page: 2, unreadOnly: true },
            );
        });

        it.each([
            ['limit above the maximum', 'limit=101'],
            ['zero limit', 'limit=0'],
            ['non-numeric page', 'page=abc'],
            ['negative page', 'page=-1'],
            ['unreadOnly that is not a boolean', 'unreadOnly=yes'],
        ])('answers 400 on %s', async (_case, query) => {
            const response = await fixture.call('GET', `/notifications?${query}`, asUser());

            expect(response.status).toBe(400);
            expect(list.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /notifications/unread-count', () => {
        it('answers 200 with the unread count of the token user', async () => {
            const response = await fixture.call('GET', '/notifications/unread-count', asUser());

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ unreadCount: 3 });
            expect(unreadCount.execute).toHaveBeenCalledWith({ userId: USER_ID });
        });
    });

    describe('POST /notifications/:id/read', () => {
        it('answers 200 with the new unread count', async () => {
            const response = await fixture.call(
                'POST',
                `/notifications/${NOTIFICATION_ID}/read`,
                asUser(),
            );

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ unreadCount: 2 });
            expect(markRead.execute).toHaveBeenCalledWith({ userId: USER_ID }, NOTIFICATION_ID);
        });

        it('answers 404 for a notification of another user', async () => {
            markRead.execute.mockRejectedValue(new NotificationNotFoundError(NOTIFICATION_ID));

            const response = await fixture.call(
                'POST',
                `/notifications/${NOTIFICATION_ID}/read`,
                asUser(),
            );

            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' });
        });

        it('answers 400 for an id that is not a uuid', async () => {
            const response = await fixture.call('POST', '/notifications/abc/read', asUser());

            expect(response.status).toBe(400);
            expect(markRead.execute).not.toHaveBeenCalled();
        });
    });

    describe('POST /notifications/read-all', () => {
        it('answers 200 with zero unread', async () => {
            const response = await fixture.call('POST', '/notifications/read-all', asUser());

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ unreadCount: 0 });
            expect(markAllRead.execute).toHaveBeenCalledWith({ userId: USER_ID });
        });
    });

    describe('access', () => {
        it.each([
            ['GET', '/notifications'],
            ['GET', '/notifications/unread-count'],
            ['POST', `/notifications/${NOTIFICATION_ID}/read`],
            ['POST', '/notifications/read-all'],
        ])('%s %s answers 401 without a token', async (method, path) => {
            const response = await fixture.call(method, path, {});

            expect(response.status).toBe(401);
        });

        it.each([
            ['GET', '/notifications'],
            ['GET', '/notifications/unread-count'],
            ['POST', `/notifications/${NOTIFICATION_ID}/read`],
            ['POST', '/notifications/read-all'],
        ])('%s %s refuses a user with a temporary password', async (method, path) => {
            const response = await fixture.call(
                method,
                path,
                fixture.bearer(USER_ID, { mustChangePassword: true }),
            );

            expect(response.status).toBe(403);
            expect(await response.json()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
        });
    });
});
