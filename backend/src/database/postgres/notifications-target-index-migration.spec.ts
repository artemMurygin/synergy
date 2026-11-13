import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';
import { migrateBefore } from './testing/migrate-before';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('030_notifications_unique_target migration', () => {
    const dbName = `notif_target_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let recipientId: string;
    let legacyId: string;
    const legacyEventId = randomUUID();

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertNotification = async (
        eventId: string,
        targetId: string,
        type = 'request_accepted',
    ): Promise<string> => {
        const rows = await query(
            `INSERT INTO notifications
                (recipient_id, type, title, target_type, target_id, source_event_id)
             VALUES ($1, $2, 'Заголовок', 'request', $3, $4) RETURNING id`,
            [recipientId, type, targetId, eventId],
        );
        return String(rows[0]?.id);
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '030');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        const users = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        recipientId = String(users[0]?.id);
        legacyId = await insertNotification(legacyEventId, 'legacy-target');

        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('keeps rows created before the migration', async () => {
        const rows = await query('SELECT target_id FROM notifications WHERE id = $1', [legacyId]);
        expect(rows).toEqual([{ target_id: 'legacy-target' }]);
    });

    it('allows the same event, recipient and type for a different target', async () => {
        const eventId = randomUUID();
        await insertNotification(eventId, 'target-1');

        await expect(insertNotification(eventId, 'target-2')).resolves.toEqual(expect.any(String));
    });

    it('rejects the same event, recipient, type and target', async () => {
        const eventId = randomUUID();
        await insertNotification(eventId, 'target-1');

        await expect(insertNotification(eventId, 'target-1')).rejects.toThrow(/duplicate key/);
        await expect(insertNotification(legacyEventId, 'legacy-target')).rejects.toThrow(
            /duplicate key/,
        );
    });

    it('replaces the old unique index with one including target_id', async () => {
        const defs = (
            await query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'notifications'`)
        ).map((r) => String(r.indexdef));
        const unique = defs.filter((d) => d.startsWith('CREATE UNIQUE INDEX'));

        expect(
            unique.some((d) => d.includes('(source_event_id, recipient_id, type, target_id)')),
        ).toBe(true);
        expect(unique.some((d) => d.includes('(source_event_id, recipient_id, type)'))).toBe(false);
    });
});
