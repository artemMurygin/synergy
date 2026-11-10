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

describe.skipIf(adminUrl === undefined)('016_outbox migration', () => {
    const dbName = `outbox_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const columns = async (table: string): Promise<Record<string, string>> => {
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

    const indexDefs = async (table: string): Promise<string[]> =>
        (await query(`SELECT indexdef FROM pg_indexes WHERE tablename = $1`, [table])).map((r) =>
            String(r.indexdef),
        );

    const createEvent = async (
        extra: { id?: string; eventType?: string; aggregateId?: string } = {},
    ): Promise<string> => {
        const id = extra.id ?? randomUUID();
        await query(
            `INSERT INTO outbox_events (id, event_type, aggregate_id, payload)
             VALUES ($1, $2, $3, '{"title":"t"}')`,
            [id, extra.eventType ?? 'tasks.task_created', extra.aggregateId ?? randomUUID()],
        );
        return id;
    };

    const createDelivery = async (
        eventId: string,
        subscriber: string,
        extra: { status?: string; attempts?: number } = {},
    ): Promise<void> => {
        await query(
            `INSERT INTO outbox_deliveries (event_id, subscriber, status, attempts)
             VALUES ($1, $2, COALESCE($3, 'pending'), COALESCE($4, 0))`,
            [eventId, subscriber, extra.status ?? null, extra.attempts ?? null],
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

    it('creates outbox_events with the expected columns', async () => {
        expect(await columns('outbox_events')).toEqual({
            id: 'uuid not null',
            event_type: 'text not null',
            aggregate_id: 'text not null',
            payload: 'jsonb not null',
            metadata: 'jsonb not null',
            created_at: 'timestamp with time zone not null',
        });
    });

    it('creates outbox_deliveries with the expected columns', async () => {
        expect(await columns('outbox_deliveries')).toEqual({
            event_id: 'uuid not null',
            subscriber: 'text not null',
            status: 'text not null',
            attempts: 'integer not null',
            next_attempt_at: 'timestamp with time zone not null',
            last_error: 'text null',
            processed_at: 'timestamp with time zone null',
        });
    });

    it('applies defaults to an event and a delivery', async () => {
        const eventId = await createEvent();
        await query(`INSERT INTO outbox_deliveries (event_id, subscriber) VALUES ($1, 'rule')`, [
            eventId,
        ]);
        const [event] = await query(
            'SELECT metadata, created_at FROM outbox_events WHERE id = $1',
            [eventId],
        );
        expect(event.metadata).toEqual({});
        expect(event.created_at).toBeInstanceOf(Date);
        const [delivery] = await query(
            `SELECT status, attempts, next_attempt_at, last_error, processed_at
             FROM outbox_deliveries WHERE event_id = $1`,
            [eventId],
        );
        expect(delivery.status).toBe('pending');
        expect(delivery.attempts).toBe(0);
        expect(delivery.next_attempt_at).toBeInstanceOf(Date);
        expect(delivery.last_error).toBeNull();
        expect(delivery.processed_at).toBeNull();
    });

    it('uses the domain event id as the primary key of outbox_events', async () => {
        const id = await createEvent();
        await expect(createEvent({ id })).rejects.toThrow();
        await expect(
            query(
                `INSERT INTO outbox_events (event_type, aggregate_id, payload)
                 VALUES ('tasks.task_created', 'a', '{}')`,
            ),
        ).rejects.toThrow();
    });

    it('rejects an empty event type', async () => {
        await expect(createEvent({ eventType: '' })).rejects.toThrow();
    });

    it('uses (event_id, subscriber) as the primary key of outbox_deliveries', async () => {
        const eventId = await createEvent();
        await createDelivery(eventId, 'notifications.task_assigned_rule');
        await createDelivery(eventId, 'notifications.realtime_channel');
        await expect(createDelivery(eventId, 'notifications.task_assigned_rule')).rejects.toThrow();
        const rows = await query(
            `SELECT a.attname FROM pg_index i
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
             WHERE i.indrelid = 'outbox_deliveries'::regclass AND i.indisprimary`,
        );
        expect(rows.map((r) => r.attname).sort()).toEqual(['event_id', 'subscriber']);
    });

    it('accepts the three statuses and rejects an unknown one', async () => {
        const eventId = await createEvent();
        for (const status of ['pending', 'done', 'failed']) {
            await expect(
                createDelivery(eventId, `s-${status}`, { status }),
            ).resolves.toBeUndefined();
        }
        await expect(createDelivery(eventId, 's-unknown', { status: 'running' })).rejects.toThrow();
    });

    it('rejects negative attempts and an empty subscriber', async () => {
        const eventId = await createEvent();
        await expect(createDelivery(eventId, 'neg', { attempts: -1 })).rejects.toThrow();
        await expect(createDelivery(eventId, '')).rejects.toThrow();
    });

    it('rejects a delivery of an unknown event', async () => {
        await expect(createDelivery(randomUUID(), 'rule')).rejects.toThrow();
    });

    it('cascades event deletion to its deliveries', async () => {
        const eventId = await createEvent();
        await createDelivery(eventId, 'rule', { status: 'done' });
        await query('DELETE FROM outbox_events WHERE id = $1', [eventId]);
        expect(
            await query('SELECT 1 FROM outbox_deliveries WHERE event_id = $1', [eventId]),
        ).toHaveLength(0);
    });

    it('creates a partial index of pending deliveries by next_attempt_at', async () => {
        const defs = await indexDefs('outbox_deliveries');
        expect(
            defs.some(
                (d) =>
                    d.includes('(next_attempt_at)') &&
                    d.includes("WHERE (status = 'pending'::text)"),
            ),
        ).toBe(true);
    });

    it('creates an index of deliveries by (subscriber, status)', async () => {
        const defs = await indexDefs('outbox_deliveries');
        expect(defs.some((d) => d.includes('(subscriber, status)'))).toBe(true);
    });

    it('creates an index of events by (aggregate_id, created_at)', async () => {
        const defs = await indexDefs('outbox_events');
        expect(defs.some((d) => d.includes('(aggregate_id, created_at)'))).toBe(true);
    });
});
