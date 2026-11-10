import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../database/postgres/migrator';
import { TransactionRunner } from '../../database/postgres/transaction-runner';
import { GetUnreadCountUseCase } from './application/get-unread-count.use-case';
import { ListNotificationsUseCase } from './application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from './application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/mark-notification-read.use-case';
import { UserRealtimeEmitterPort } from './application/ports/user-realtime-emitter.port';
import { RecordingRealtimeEmitter } from './application/test-doubles';
import { Notification } from './domain/notification';
import { NotificationContent } from './domain/notification-content';
import { NotificationTarget } from './domain/notification-target';
import { NotificationClockPort } from './domain/ports/notification-clock.port';
import { NotificationRepositoryPort } from './domain/ports/notification-repository.port';
import { NotificationClock } from './infrastructure/notification-clock';
import { NotificationRepository } from './infrastructure/notification.repository';
import { NotificationsController } from './interface/http/notifications.controller';
import {
    type NotificationsHttpFixture,
    startNotificationsHttpFixture,
} from './interface/http/testing/notifications-http-fixture';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const T0 = new Date('2026-03-01T10:00:00.000Z');
const MINUTE_MS = 60_000;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('notifications REST API (real storage)', () => {
    const databaseName = `notifications_api_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: NotificationRepository;
    let fixture: NotificationsHttpFixture;
    const emitter = new RecordingRealtimeEmitter();
    let anna: string;
    let boris: string;
    let sequence = 0;

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    async function seed(recipientId: string, count: number): Promise<Notification[]> {
        const notifications = Array.from({ length: count }, () => {
            sequence += 1;
            return Notification.create({
                id: randomUUID(),
                draft: {
                    recipientId,
                    type: 'task.assigned',
                    content: NotificationContent.of({
                        title: 'Вам назначена задача',
                        body: `anna назначил вас ответственным: Задача ${String(sequence)}`,
                    }),
                    target: NotificationTarget.of({ type: 'task', id: randomUUID() }),
                    actorId: anna,
                },
                sourceEventId: randomUUID(),
                now: new Date(T0.getTime() + sequence * MINUTE_MS),
            });
        });
        return transactions.run(() => repository.insertIgnoringDuplicates(notifications));
    }

    async function readAtOf(id: string): Promise<Date | null> {
        const result = await client.query<{ read_at: Date | null }>(
            'SELECT read_at FROM notifications WHERE id = $1',
            [id],
        );
        return result.rows[0]?.read_at ?? null;
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl ?? '', databaseName);
        await migrate(databaseUrl);
        client = new Client({ connectionString: databaseUrl });
        await client.connect();
        pool = await createPool(databaseUrl);
        transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        repository = new NotificationRepository(transactions);
        anna = await addUser('anna');
        boris = await addUser('boris');
        fixture = await startNotificationsHttpFixture({
            controllers: [NotificationsController],
            providers: [
                ListNotificationsUseCase,
                GetUnreadCountUseCase,
                MarkNotificationReadUseCase,
                MarkAllNotificationsReadUseCase,
                { provide: NotificationRepositoryPort, useValue: repository },
                { provide: NotificationClockPort, useClass: NotificationClock },
                { provide: UserRealtimeEmitterPort, useValue: emitter },
            ],
        });
    }, 60_000);

    afterAll(async () => {
        await fixture.app.close();
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM notifications');
        emitter.emitted.length = 0;
    });

    it('lists the 20 newest of 30 notifications with the total, never another user', async () => {
        const borisNotifications = await seed(boris, 30);
        await seed(anna, 2);

        const response = await fixture.call(
            'GET',
            '/notifications?limit=20',
            fixture.bearer(boris),
        );

        expect(response.status).toBe(200);
        const body: unknown = await response.json();
        const newestIds = borisNotifications
            .slice(-20)
            .reverse()
            .map((notification) => notification.id);
        expect(body).toMatchObject({
            total: 30,
            limit: 20,
            page: 0,
            items: newestIds.map((id) => ({ id, readAt: null })),
        });
    });

    it('returns the second page', async () => {
        const borisNotifications = await seed(boris, 30);

        const response = await fixture.call(
            'GET',
            '/notifications?limit=20&page=1',
            fixture.bearer(boris),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            total: 30,
            page: 1,
            items: borisNotifications
                .slice(0, 10)
                .reverse()
                .map((notification) => ({ id: notification.id })),
        });
    });

    it('filters unread only and counts unread', async () => {
        const [first, second, third] = await seed(boris, 3);
        await fixture.call('POST', `/notifications/${first.id}/read`, fixture.bearer(boris));

        const unreadResponse = await fixture.call(
            'GET',
            '/notifications?unreadOnly=true',
            fixture.bearer(boris),
        );
        const countResponse = await fixture.call(
            'GET',
            '/notifications/unread-count',
            fixture.bearer(boris),
        );

        expect(await unreadResponse.json()).toMatchObject({
            total: 2,
            items: [{ id: third.id }, { id: second.id }],
        });
        expect(countResponse.status).toBe(200);
        expect(await countResponse.json()).toEqual({ unreadCount: 2 });
    });

    it('marks one notification read, keeps the first read time and syncs other connections', async () => {
        const [first] = await seed(boris, 2);

        const firstResponse = await fixture.call(
            'POST',
            `/notifications/${first.id}/read`,
            fixture.bearer(boris),
        );
        const readAt = await readAtOf(first.id);
        const repeatResponse = await fixture.call(
            'POST',
            `/notifications/${first.id}/read`,
            fixture.bearer(boris),
        );

        expect(firstResponse.status).toBe(200);
        expect(await firstResponse.json()).toEqual({ unreadCount: 1 });
        expect(readAt).not.toBeNull();
        expect(repeatResponse.status).toBe(200);
        expect(await readAtOf(first.id)).toEqual(readAt);
        expect(emitter.emitted[0]).toEqual({
            userId: boris,
            event: {
                name: 'notification.read',
                payload: { notificationIds: [first.id], unreadCount: 1 },
            },
        });
    });

    it('answers 404 for a notification of another user and leaves it unread', async () => {
        const [annaNotification] = await seed(anna, 1);

        const response = await fixture.call(
            'POST',
            `/notifications/${annaNotification.id}/read`,
            fixture.bearer(boris),
        );

        expect(response.status).toBe(404);
        expect(await readAtOf(annaNotification.id)).toBeNull();
        expect(emitter.emitted).toEqual([]);
    });

    it('answers 404 for a notification that does not exist', async () => {
        const response = await fixture.call(
            'POST',
            `/notifications/${randomUUID()}/read`,
            fixture.bearer(boris),
        );

        expect(response.status).toBe(404);
    });

    it('marks all notifications of the user read', async () => {
        await seed(boris, 3);
        const [annaNotification] = await seed(anna, 1);

        const response = await fixture.call(
            'POST',
            '/notifications/read-all',
            fixture.bearer(boris),
        );
        const countResponse = await fixture.call(
            'GET',
            '/notifications/unread-count',
            fixture.bearer(boris),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ unreadCount: 0 });
        expect(await countResponse.json()).toEqual({ unreadCount: 0 });
        expect(await readAtOf(annaNotification.id)).toBeNull();
        expect(emitter.emitted).toEqual([
            {
                userId: boris,
                event: { name: 'notification.read', payload: { all: true, unreadCount: 0 } },
            },
        ]);
    });

    it('answers 400 on a limit above the maximum', async () => {
        const response = await fixture.call(
            'GET',
            '/notifications?limit=1000',
            fixture.bearer(boris),
        );

        expect(response.status).toBe(400);
    });

    it('answers 401 without a token', async () => {
        const response = await fixture.call('GET', '/notifications', {});

        expect(response.status).toBe(401);
    });

    it('refuses a user with a temporary password', async () => {
        const response = await fixture.call(
            'GET',
            '/notifications/unread-count',
            fixture.bearer(boris, { mustChangePassword: true }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    });
});
