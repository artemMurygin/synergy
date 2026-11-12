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

describe.skipIf(adminUrl === undefined)('024_task_initiator migration', () => {
    const dbName = `task_init_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let creatorId: string;
    let initiatorId: string;
    let legacyTaskIds: string[];

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createUser = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    const insertLegacyTask = async (creator: string): Promise<string> => {
        const rows = await query(
            `INSERT INTO task (title, creator_id) VALUES ('Задача', $1) RETURNING id`,
            [creator],
        );
        return String(rows[0]?.id);
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '024');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        creatorId = await createUser();
        initiatorId = await createUser();
        const otherCreator = await createUser();
        legacyTaskIds = [await insertLegacyTask(creatorId), await insertLegacyTask(otherCreator)];

        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('fills initiator_id of existing tasks with creator_id', async () => {
        const rows = await query(
            'SELECT creator_id, initiator_id FROM task WHERE id = ANY($1::uuid[])',
            [legacyTaskIds],
        );

        expect(rows).toHaveLength(2);
        for (const row of rows) expect(row.initiator_id).toBe(row.creator_id);
    });

    it('makes initiator_id NOT NULL', async () => {
        const [column] = await query(
            `SELECT is_nullable FROM information_schema.columns
             WHERE table_name = 'task' AND column_name = 'initiator_id'`,
        );

        expect(column.is_nullable).toBe('NO');
        await expect(
            query(`INSERT INTO task (title, creator_id) VALUES ('Задача', $1)`, [creatorId]),
        ).rejects.toThrow(/null value in column "initiator_id"/);
    });

    it('stores an initiator different from the creator', async () => {
        const [row] = await query(
            `INSERT INTO task (title, creator_id, initiator_id) VALUES ('Задача', $1, $2)
             RETURNING creator_id, initiator_id`,
            [creatorId, initiatorId],
        );

        expect(row).toEqual({ creator_id: creatorId, initiator_id: initiatorId });
    });

    it('references auth_users', async () => {
        await expect(
            query(`INSERT INTO task (title, creator_id, initiator_id) VALUES ('Задача', $1, $2)`, [
                creatorId,
                randomUUID(),
            ]),
        ).rejects.toThrow(/foreign key/);
    });
});
