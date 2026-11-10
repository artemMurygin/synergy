import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('018_telegram migration', () => {
    const dbName = `tg_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let counter = 0;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const columnsOf = async (table: string): Promise<Record<string, string>> => {
        const rows = await query(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1`,
            [table],
        );
        return Object.fromEntries(
            rows.map((r) => [
                String(r.column_name),
                `${String(r.data_type)} ${r.is_nullable === 'YES' ? 'null' : 'not null'}`,
            ]),
        );
    };

    const createUser = async (): Promise<string> => {
        counter += 1;
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`tguser${String(counter)}`],
        );
        return String(rows[0]?.id);
    };

    const createNotification = async (recipientId: string): Promise<string> => {
        const rows = await query(
            `INSERT INTO notifications (recipient_id, type, title, target_type, target_id, source_event_id)
             VALUES ($1, 'task.assigned', 'T', 'task', 'x', $2) RETURNING id`,
            [recipientId, randomUUID()],
        );
        return String(rows[0]?.id);
    };

    const insertLink = async (
        userId: string,
        telegramUserId: number,
        extra: { chatId?: number; username?: string | null } = {},
    ): Promise<void> => {
        await query(
            `INSERT INTO telegram_links
                 (user_id, telegram_user_id, chat_id, username, linked_at, updated_at)
             VALUES ($1, $2, $3, $4, now(), now())`,
            [userId, telegramUserId, extra.chatId ?? telegramUserId, extra.username ?? null],
        );
    };

    const insertDelivery = async (values: {
        notificationId: string;
        userId: string;
        status: string;
        messageId?: number | null;
        sentAt?: Date | null;
    }): Promise<void> => {
        await query(
            `INSERT INTO telegram_deliveries
                 (notification_id, user_id, status, reserved_at, message_id, sent_at)
             VALUES ($1, $2, $3, now(), $4, $5)`,
            [
                values.notificationId,
                values.userId,
                values.status,
                values.messageId ?? null,
                values.sentAt ?? null,
            ],
        );
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('records the migration as applied', async () => {
        const rows = await query(`SELECT 1 FROM schema_migrations WHERE name = '018_telegram.sql'`);
        expect(rows).toHaveLength(1);
    });

    it('creates telegram_links with the expected columns', async () => {
        expect(await columnsOf('telegram_links')).toEqual({
            user_id: 'uuid not null',
            telegram_user_id: 'bigint not null',
            chat_id: 'bigint not null',
            username: 'text null',
            notifications_enabled: 'boolean not null',
            linked_at: 'timestamp with time zone not null',
            updated_at: 'timestamp with time zone not null',
        });
    });

    it('enables notifications by default and accepts an empty username', async () => {
        const userId = await createUser();
        await insertLink(userId, 1001);
        const [row] = await query(
            'SELECT notifications_enabled, username FROM telegram_links WHERE user_id = $1',
            [userId],
        );
        expect(row.notifications_enabled).toBe(true);
        expect(row.username).toBeNull();
    });

    it('keeps telegram ids beyond the 32-bit range', async () => {
        const userId = await createUser();
        await insertLink(userId, 7_000_000_001);
        const [row] = await query(
            'SELECT telegram_user_id::text AS id FROM telegram_links WHERE user_id = $1',
            [userId],
        );
        expect(row.id).toBe('7000000001');
    });

    it('uses user_id as the primary key', async () => {
        const userId = await createUser();
        await insertLink(userId, 1101);
        await expect(insertLink(userId, 1102)).rejects.toThrow();
    });

    it('allows one link per telegram account', async () => {
        await insertLink(await createUser(), 1201);
        await expect(insertLink(await createUser(), 1201)).rejects.toThrow(
            /telegram_links_telegram_user_id_key/,
        );
    });

    it('requires an existing user and cascades user deletion to the link', async () => {
        await expect(insertLink(randomUUID(), 1301)).rejects.toThrow();
        const userId = await createUser();
        await insertLink(userId, 1302);
        await query('DELETE FROM auth_users WHERE id = $1', [userId]);
        expect(
            await query('SELECT 1 FROM telegram_links WHERE user_id = $1', [userId]),
        ).toHaveLength(0);
    });

    it('rejects non-positive telegram ids', async () => {
        await expect(insertLink(await createUser(), 0)).rejects.toThrow();
        await expect(insertLink(await createUser(), 1401, { chatId: -1401 })).rejects.toThrow();
    });

    it('creates telegram_deliveries with the expected columns', async () => {
        expect(await columnsOf('telegram_deliveries')).toEqual({
            notification_id: 'uuid not null',
            user_id: 'uuid not null',
            status: 'text not null',
            reserved_at: 'timestamp with time zone not null',
            message_id: 'bigint null',
            sent_at: 'timestamp with time zone null',
        });
    });

    it('accepts sending, sent and skipped and rejects any other status', async () => {
        const userId = await createUser();
        await insertDelivery({
            notificationId: await createNotification(userId),
            userId,
            status: 'sending',
        });
        await insertDelivery({
            notificationId: await createNotification(userId),
            userId,
            status: 'sent',
            messageId: 42,
            sentAt: new Date(),
        });
        await insertDelivery({
            notificationId: await createNotification(userId),
            userId,
            status: 'skipped',
        });
        await expect(
            insertDelivery({
                notificationId: await createNotification(userId),
                userId,
                status: 'failed',
            }),
        ).rejects.toThrow();
    });

    it('allows null message_id and sent_at until the message is sent', async () => {
        const userId = await createUser();
        const notificationId = await createNotification(userId);
        await insertDelivery({ notificationId, userId, status: 'sending' });
        const [row] = await query(
            'SELECT message_id, sent_at FROM telegram_deliveries WHERE notification_id = $1',
            [notificationId],
        );
        expect(row.message_id).toBeNull();
        expect(row.sent_at).toBeNull();
        await expect(
            insertDelivery({
                notificationId: await createNotification(userId),
                userId,
                status: 'sent',
            }),
        ).rejects.toThrow();
    });

    it('uses notification_id as the primary key', async () => {
        const userId = await createUser();
        const notificationId = await createNotification(userId);
        await insertDelivery({ notificationId, userId, status: 'sending' });
        await expect(
            insertDelivery({ notificationId, userId, status: 'skipped' }),
        ).rejects.toThrow();
    });

    it('is cleaned up together with the notification', async () => {
        const userId = await createUser();
        const notificationId = await createNotification(userId);
        await insertDelivery({ notificationId, userId, status: 'skipped' });
        await query('DELETE FROM notifications WHERE id = $1', [notificationId]);
        expect(
            await query('SELECT 1 FROM telegram_deliveries WHERE notification_id = $1', [
                notificationId,
            ]),
        ).toHaveLength(0);
    });
});
