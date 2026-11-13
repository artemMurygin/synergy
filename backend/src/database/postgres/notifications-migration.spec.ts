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

describe.skipIf(adminUrl === undefined)('017_notifications migration', () => {
    const dbName = `notif_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let counter = 0;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createUser = async (): Promise<string> => {
        counter += 1;
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`user${String(counter)}`],
        );
        return String(rows[0]?.id);
    };

    const createNotification = async (
        recipientId: string,
        extra: {
            type?: string;
            title?: string;
            body?: string;
            targetType?: string;
            targetId?: string;
            actorId?: string | null;
            sourceEventId?: string;
            createdAt?: Date;
            readAt?: Date | null;
        } = {},
    ): Promise<string> => {
        const rows = await query(
            `INSERT INTO notifications
                 (recipient_id, type, title, body, target_type, target_id, actor_id,
                  source_event_id, created_at, read_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10) RETURNING id`,
            [
                recipientId,
                extra.type ?? 'task.assigned',
                extra.title ?? 'Вам назначена задача',
                extra.body ?? 'Подготовить отчёт',
                extra.targetType ?? 'task',
                extra.targetId ?? randomUUID(),
                extra.actorId ?? null,
                extra.sourceEventId ?? randomUUID(),
                extra.createdAt ?? null,
                extra.readAt ?? null,
            ],
        );
        return String(rows[0]?.id);
    };

    const indexDefs = async (table: string): Promise<string[]> =>
        (await query(`SELECT indexdef FROM pg_indexes WHERE tablename = $1`, [table])).map((r) =>
            String(r.indexdef),
        );

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

    it('creates notifications with the expected columns', async () => {
        const rows = await query(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notifications'`,
        );
        expect(
            Object.fromEntries(
                rows.map((r) => [
                    String(r.column_name),
                    `${String(r.data_type)} ${r.is_nullable === 'YES' ? 'null' : 'not null'}`,
                ]),
            ),
        ).toEqual({
            id: 'uuid not null',
            recipient_id: 'uuid not null',
            type: 'text not null',
            title: 'text not null',
            body: 'text not null',
            target_type: 'text not null',
            target_id: 'text not null',
            actor_id: 'uuid null',
            source_event_id: 'uuid not null',
            created_at: 'timestamp with time zone not null',
            read_at: 'timestamp with time zone null',
        });
    });

    it('generates id and created_at and leaves the notification unread', async () => {
        const recipient = await createUser();
        const [row] = await query(
            `INSERT INTO notifications
                 (recipient_id, type, title, target_type, target_id, source_event_id)
             VALUES ($1, 'task.assigned', 'T', 'task', 'x', $2)
             RETURNING id, body, created_at, read_at`,
            [recipient, randomUUID()],
        );
        expect(row.id).toBeTypeOf('string');
        expect(row.body).toBe('');
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.read_at).toBeNull();
    });

    it('is idempotent by (source_event_id, recipient_id, type, target_id)', async () => {
        const recipient = await createUser();
        const other = await createUser();
        const sourceEventId = randomUUID();
        await createNotification(recipient, { sourceEventId, targetId: 'x' });
        await expect(
            createNotification(recipient, { sourceEventId, targetId: 'x' }),
        ).rejects.toThrow();
        await expect(
            createNotification(other, { sourceEventId, targetId: 'x' }),
        ).resolves.toBeTypeOf('string');
        await expect(
            createNotification(recipient, { sourceEventId, type: 'task.commented', targetId: 'x' }),
        ).resolves.toBeTypeOf('string');
        const inserted = await query(
            `INSERT INTO notifications
                 (recipient_id, type, title, target_type, target_id, source_event_id)
             VALUES ($1, 'task.assigned', 'T', 'task', 'x', $2)
             ON CONFLICT (source_event_id, recipient_id, type, target_id) DO NOTHING RETURNING id`,
            [recipient, sourceEventId],
        );
        expect(inserted).toHaveLength(0);
    });

    it('limits title to 1..200 and body to 1000 characters', async () => {
        const recipient = await createUser();
        await expect(createNotification(recipient, { title: 'x'.repeat(200) })).resolves.toBeTypeOf(
            'string',
        );
        await expect(createNotification(recipient, { title: '' })).rejects.toThrow();
        await expect(createNotification(recipient, { title: 'x'.repeat(201) })).rejects.toThrow();
        await expect(createNotification(recipient, { body: 'x'.repeat(1000) })).resolves.toBeTypeOf(
            'string',
        );
        await expect(createNotification(recipient, { body: 'x'.repeat(1001) })).rejects.toThrow();
    });

    it('rejects an empty type, target type or target id', async () => {
        const recipient = await createUser();
        await expect(createNotification(recipient, { type: '' })).rejects.toThrow();
        await expect(createNotification(recipient, { targetType: '' })).rejects.toThrow();
        await expect(createNotification(recipient, { targetId: '' })).rejects.toThrow();
    });

    it('rejects read_at earlier than created_at', async () => {
        const recipient = await createUser();
        const createdAt = new Date('2026-01-02T00:00:00Z');
        await expect(
            createNotification(recipient, { createdAt, readAt: new Date('2026-01-01T00:00:00Z') }),
        ).rejects.toThrow();
        await expect(
            createNotification(recipient, { createdAt, readAt: new Date('2026-01-03T00:00:00Z') }),
        ).resolves.toBeTypeOf('string');
    });

    it('requires an existing recipient and actor', async () => {
        await expect(createNotification(randomUUID())).rejects.toThrow();
        await expect(
            createNotification(await createUser(), { actorId: randomUUID() }),
        ).rejects.toThrow();
    });

    it('deletes notifications with the recipient and keeps them without the actor', async () => {
        const recipient = await createUser();
        const actor = await createUser();
        const kept = await createNotification(recipient, { actorId: actor });
        await query('DELETE FROM auth_users WHERE id = $1', [actor]);
        const [row] = await query('SELECT actor_id FROM notifications WHERE id = $1', [kept]);
        expect(row.actor_id).toBeNull();
        await query('DELETE FROM auth_users WHERE id = $1', [recipient]);
        expect(await query('SELECT 1 FROM notifications WHERE id = $1', [kept])).toHaveLength(0);
    });

    it('creates the list, unread and idempotency indexes', async () => {
        const defs = await indexDefs('notifications');
        expect(defs.some((d) => d.includes('(recipient_id, created_at DESC)'))).toBe(true);
        expect(
            defs.some((d) => d.includes('(recipient_id)') && d.includes('WHERE (read_at IS NULL)')),
        ).toBe(true);
        expect(
            defs.some(
                (d) =>
                    d.startsWith('CREATE UNIQUE INDEX') &&
                    d.includes('(source_event_id, recipient_id, type, target_id)'),
            ),
        ).toBe(true);
    });
});
