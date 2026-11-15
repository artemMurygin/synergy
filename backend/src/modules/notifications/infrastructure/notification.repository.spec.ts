import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { Notification } from '../domain/notification';
import { NotificationContent } from '../domain/notification-content';
import { NotificationTarget } from '../domain/notification-target';
import { NotificationRepository } from './notification.repository';
import { UserDirectory } from './user-directory';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-03-01T10:00:00.000Z');
const MINUTE_MS = 60_000;

class RollbackRequested extends Error {}

describe.skipIf(adminUrl === undefined)('NotificationRepository', () => {
    const databaseName = `notifications_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: NotificationRepository;
    let anna: string;
    let boris: string;
    let carol: string;

    async function addUser(login: string, isActive = true): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, $4)',
            [id, login, '$argon2id$fake', isActive],
        );
        return id;
    }

    let sequence = 0;
    function makeNotification(
        overrides: {
            recipientId?: string;
            sourceEventId?: string;
            createdAt?: Date;
            actorId?: string | null;
            title?: string;
            targetId?: string;
        } = {},
    ): Notification {
        sequence += 1;
        return Notification.create({
            id: randomUUID(),
            draft: {
                recipientId: overrides.recipientId ?? boris,
                type: 'task.assigned',
                content: NotificationContent.of({
                    title: overrides.title ?? 'Вам назначена задача',
                    body: `anna назначил вас ответственным: Задача ${String(sequence)}`,
                }),
                target: NotificationTarget.of({
                    type: 'task',
                    id: overrides.targetId ?? randomUUID(),
                }),
                actorId: overrides.actorId === undefined ? anna : overrides.actorId,
            },
            sourceEventId: overrides.sourceEventId ?? randomUUID(),
            now: overrides.createdAt ?? new Date(T0.getTime() + sequence * MINUTE_MS),
        });
    }

    async function insert(...notifications: Notification[]): Promise<Notification[]> {
        return transactions.run(() => repository.insertIgnoringDuplicates(notifications));
    }

    async function readAtOf(id: string): Promise<Date | null> {
        const result = await client.query<{ read_at: Date | null }>(
            'SELECT read_at FROM notifications WHERE id = $1',
            [id],
        );
        return result.rows[0]?.read_at ?? null;
    }

    async function countNotifications(): Promise<number> {
        const result = await client.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM notifications',
        );
        return result.rows[0]?.count ?? 0;
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
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM notifications');
        await client.query('DELETE FROM auth_users');
        anna = await addUser('anna');
        boris = await addUser('boris');
        carol = await addUser('carol');
    });

    describe('insertIgnoringDuplicates', () => {
        it('stores the notifications and returns all of them when none existed', async () => {
            const first = makeNotification();
            const second = makeNotification({ recipientId: carol, actorId: null });

            const inserted = await insert(first, second);

            expect(inserted.map((notification) => notification.id)).toEqual([first.id, second.id]);
            const stored = await repository.findById(second.id);
            expect(stored).not.toBeNull();
            if (stored === null) return;
            expect(stored.recipientId).toBe(carol);
            expect(stored.type).toBe('task.assigned');
            expect(stored.content.equals(second.content)).toBe(true);
            expect(stored.target.equals(second.target)).toBe(true);
            expect(stored.actorId).toBeNull();
            expect(stored.sourceEventId).toBe(second.sourceEventId);
            expect(stored.createdAt).toEqual(second.createdAt);
            expect(stored.readAt).toBeNull();
        });

        it('skips a duplicate by (source_event_id, recipient_id, type, target_id) and returns only the inserted', async () => {
            const sourceEventId = randomUUID();
            const targetId = randomUUID();
            const original = makeNotification({ sourceEventId, targetId });
            await insert(original);

            const repeat = makeNotification({ sourceEventId, targetId, title: 'Повтор' });
            const forAnotherRecipient = makeNotification({
                sourceEventId,
                targetId,
                recipientId: carol,
            });
            const inserted = await insert(repeat, forAnotherRecipient);

            expect(inserted.map((notification) => notification.id)).toEqual([
                forAnotherRecipient.id,
            ]);
            expect(await countNotifications()).toBe(2);
            expect(await repository.findById(repeat.id)).toBeNull();
            expect((await repository.findById(original.id))?.content.title).toBe(
                'Вам назначена задача',
            );
        });

        it('returns nothing for an empty batch', async () => {
            expect(await insert()).toEqual([]);
        });

        it('writes through the transactional executor and rolls back with the transaction', async () => {
            await expect(
                transactions.run(async () => {
                    await repository.insertIgnoringDuplicates([makeNotification()]);
                    expect(await countNotifications()).toBe(0);
                    expect((await repository.findPage(boris, firstPage())).total).toBe(1);
                    throw new RollbackRequested();
                }),
            ).rejects.toBeInstanceOf(RollbackRequested);

            expect(await countNotifications()).toBe(0);
        });
    });

    describe('findById', () => {
        it('returns null for an unknown or malformed id', async () => {
            expect(await repository.findById(randomUUID())).toBeNull();
            expect(await repository.findById('not-a-uuid')).toBeNull();
        });
    });

    function firstPage(overrides: { limit?: number; page?: number; isUnreadOnly?: boolean } = {}): {
        limit: number;
        page: number;
        isUnreadOnly: boolean;
    } {
        return { limit: 20, page: 0, isUnreadOnly: false, ...overrides };
    }

    describe('findPage', () => {
        it('returns the newest first with the total count', async () => {
            const created = Array.from({ length: 5 }, () => makeNotification());
            await insert(...created);
            const newestFirst = [...created].reverse().map((notification) => notification.id);

            const first = await repository.findPage(boris, firstPage({ limit: 2 }));
            const third = await repository.findPage(boris, firstPage({ limit: 2, page: 2 }));

            expect(first.total).toBe(5);
            expect(first.items.map((notification) => notification.id)).toEqual(
                newestFirst.slice(0, 2),
            );
            expect(third.total).toBe(5);
            expect(third.items.map((notification) => notification.id)).toEqual(
                newestFirst.slice(4),
            );
        });

        it('filters unread only', async () => {
            const read = makeNotification();
            const unread = makeNotification();
            await insert(read, unread);
            await repository.markRead(read.id, boris, new Date(T0.getTime() + 60 * MINUTE_MS));

            const page = await repository.findPage(boris, firstPage({ isUnreadOnly: true }));

            expect(page.total).toBe(1);
            expect(page.items.map((notification) => notification.id)).toEqual([unread.id]);
            expect(page.items[0]?.readAt).toBeNull();
        });

        it('returns only notifications of the recipient', async () => {
            const own = makeNotification();
            const foreign = makeNotification({ recipientId: carol });
            await insert(own, foreign);

            const page = await repository.findPage(boris, firstPage());

            expect(page.total).toBe(1);
            expect(page.items.map((notification) => notification.id)).toEqual([own.id]);
        });
    });

    describe('countUnread', () => {
        it('counts only unread notifications of the recipient', async () => {
            const notifications = [
                makeNotification(),
                makeNotification(),
                makeNotification(),
                makeNotification({ recipientId: carol }),
            ];
            await insert(...notifications);
            await repository.markRead(notifications[0].id, boris, new Date());

            expect(await repository.countUnread(boris)).toBe(2);
            expect(await repository.countUnread(carol)).toBe(1);
            expect(await repository.countUnread(anna)).toBe(0);
        });
    });

    describe('markRead', () => {
        it('marks an unread notification and records the read time', async () => {
            const notification = makeNotification();
            await insert(notification);
            const readAt = new Date(notification.createdAt.getTime() + 5 * MINUTE_MS);

            expect(await repository.markRead(notification.id, boris, readAt)).toBe('marked');
            expect(await readAtOf(notification.id)).toEqual(readAt);
        });

        it('reports already-read without changing the read time', async () => {
            const notification = makeNotification();
            await insert(notification);
            const firstReadAt = new Date(notification.createdAt.getTime() + MINUTE_MS);
            await repository.markRead(notification.id, boris, firstReadAt);

            const result = await repository.markRead(
                notification.id,
                boris,
                new Date(firstReadAt.getTime() + 60 * MINUTE_MS),
            );

            expect(result).toBe('already-read');
            expect(await readAtOf(notification.id)).toEqual(firstReadAt);
        });

        it('reports not-found for a foreign notification and leaves it unread', async () => {
            const notification = makeNotification();
            await insert(notification);

            expect(await repository.markRead(notification.id, carol, new Date())).toBe('not-found');
            expect(await readAtOf(notification.id)).toBeNull();
        });

        it('reports not-found for an unknown or malformed id', async () => {
            expect(await repository.markRead(randomUUID(), boris, new Date())).toBe('not-found');
            expect(await repository.markRead('not-a-uuid', boris, new Date())).toBe('not-found');
        });

        it('never records a read time earlier than the creation time', async () => {
            const notification = makeNotification();
            await insert(notification);

            await repository.markRead(
                notification.id,
                boris,
                new Date(notification.createdAt.getTime() - MINUTE_MS),
            );

            expect(await readAtOf(notification.id)).toEqual(notification.createdAt);
        });
    });

    describe('markAllRead', () => {
        it('marks every unread notification of the recipient and keeps earlier read times', async () => {
            const alreadyRead = makeNotification();
            const unread = [makeNotification(), makeNotification()];
            const foreign = makeNotification({ recipientId: carol });
            await insert(alreadyRead, ...unread, foreign);
            const earlierReadAt = new Date(alreadyRead.createdAt.getTime() + MINUTE_MS);
            await repository.markRead(alreadyRead.id, boris, earlierReadAt);
            const now = new Date(T0.getTime() + 24 * 60 * MINUTE_MS);

            await repository.markAllRead(boris, now);

            expect(await repository.countUnread(boris)).toBe(0);
            expect(await readAtOf(unread[0].id)).toEqual(now);
            expect(await readAtOf(unread[1].id)).toEqual(now);
            expect(await readAtOf(alreadyRead.id)).toEqual(earlierReadAt);
            expect(await readAtOf(foreign.id)).toBeNull();
        });
    });
});

describe.skipIf(adminUrl === undefined)('UserDirectory', () => {
    const databaseName = `notifications_users_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let directory: UserDirectory;

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
        directory = new UserDirectory(
            new TransactionRunner(pool, new PinoLogger({ pinoHttp: { level: 'silent' } })),
        );
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    async function addUser(login: string, isActive: boolean): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, $4)',
            [id, login, '$argon2id$fake', isActive],
        );
        return id;
    }

    it('returns the login by user id, including a deactivated user', async () => {
        const active = await addUser('ivanov', true);
        const deactivated = await addUser('petrova', false);

        expect(await directory.findLoginById(active)).toBe('ivanov');
        expect(await directory.findLoginById(deactivated)).toBe('petrova');
    });

    it('returns null for an unknown or malformed id', async () => {
        expect(await directory.findLoginById(randomUUID())).toBeNull();
        expect(await directory.findLoginById('not-a-uuid')).toBeNull();
    });

    it('returns the full name of the profile, or the login without one', async () => {
        const full = await addUser('sidorov', true);
        await client.query(
            'INSERT INTO auth_user_profiles (user_id, last_name, first_name, middle_name) VALUES ($1, $2, $3, $4)',
            [full, 'Сидоров', 'Пётр', 'Иванович'],
        );
        const partial = await addUser('kuznetsova', true);
        await client.query(
            'INSERT INTO auth_user_profiles (user_id, last_name, first_name) VALUES ($1, $2, $3)',
            [partial, 'Кузнецова', 'Анна'],
        );
        const bare = await addUser('bare', true);

        expect(await directory.findFullNameById(full)).toBe('Сидоров Пётр Иванович');
        expect(await directory.findFullNameById(partial)).toBe('Кузнецова Анна');
        expect(await directory.findFullNameById(bare)).toBe('bare');
    });

    it('returns null from findFullNameById for an unknown or malformed id', async () => {
        expect(await directory.findFullNameById(randomUUID())).toBeNull();
        expect(await directory.findFullNameById('not-a-uuid')).toBeNull();
    });
});
