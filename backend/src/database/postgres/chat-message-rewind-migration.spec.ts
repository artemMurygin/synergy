import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна чистая PostgreSQL. Админский URL задаётся через
// PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('041_chat_message_rewind migration', () => {
    const dbName = `chat_rewind_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let sessionId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        const [user] = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'h') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        const [session] = await query(
            `INSERT INTO chat_session (id, owner_id, channel, title)
             VALUES ($1, $2, 'app', 'Чат') RETURNING id`,
            [randomUUID(), user.id],
        );
        sessionId = String(session.id);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('adds agent_checkpoint_id as nullable text and rewindable as not null boolean', async () => {
        const rows = await query(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_name = 'chat_message' AND column_name IN ('agent_checkpoint_id', 'rewindable')
             ORDER BY column_name`,
        );
        expect(rows).toEqual([
            {
                column_name: 'agent_checkpoint_id',
                data_type: 'text',
                is_nullable: 'YES',
                column_default: null,
            },
            {
                column_name: 'rewindable',
                data_type: 'boolean',
                is_nullable: 'NO',
                column_default: 'false',
            },
        ]);
    });

    it('a message inserted the old way is not rewindable and has no checkpoint', async () => {
        const [row] = await query(
            `INSERT INTO chat_message (session_id, role, text) VALUES ($1, 'user', 'старый')
             RETURNING rewindable, agent_checkpoint_id`,
            [sessionId],
        );
        expect(row).toEqual({ rewindable: false, agent_checkpoint_id: null });
    });

    it('stores a checkpoint id and rewindable = true', async () => {
        const [row] = await query(
            `INSERT INTO chat_message (session_id, role, text, agent_checkpoint_id, rewindable)
             VALUES ($1, 'user', 'новый', 'cp-1', true)
             RETURNING rewindable, agent_checkpoint_id`,
            [sessionId],
        );
        expect(row).toEqual({ rewindable: true, agent_checkpoint_id: 'cp-1' });
    });
});
