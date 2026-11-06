import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('012_chat_sessions migration', () => {
    const dbName = `chat_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createSession = async (): Promise<string> => {
        const rows = await query(`INSERT INTO chat_session (title) VALUES ('t') RETURNING id`);
        return String(rows[0]?.id);
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

    it('creates chat_session and chat_message tables', async () => {
        const rows = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name IN ('chat_session', 'chat_message')`,
        );
        expect(rows.map((r) => r.table_name).sort()).toEqual(['chat_message', 'chat_session']);
    });

    it('cascades message deletion when a session is deleted', async () => {
        const sessionId = await createSession();
        await query(
            `INSERT INTO chat_message (session_id, role, text) VALUES ($1, 'user', 'q'), ($1, 'agent', 'a')`,
            [sessionId],
        );
        await query('DELETE FROM chat_session WHERE id = $1', [sessionId]);
        const rows = await query('SELECT 1 FROM chat_message WHERE session_id = $1', [sessionId]);
        expect(rows).toHaveLength(0);
    });

    it('rejects messages of an unknown session', async () => {
        await expect(
            query(`INSERT INTO chat_message (session_id, role, text) VALUES ($1, 'user', 'q')`, [
                randomUUID(),
            ]),
        ).rejects.toThrow();
    });

    it('rejects unknown roles', async () => {
        const sessionId = await createSession();
        await expect(
            query(`INSERT INTO chat_message (session_id, role, text) VALUES ($1, 'bot', 'q')`, [
                sessionId,
            ]),
        ).rejects.toThrow();
    });

    it('creates indexes on last_activity_at and (session_id, id)', async () => {
        const rows = await query(
            `SELECT indexdef FROM pg_indexes
             WHERE tablename IN ('chat_session', 'chat_message') AND indexname NOT LIKE '%pkey'`,
        );
        const defs = rows.map((r) => String(r.indexdef));
        expect(defs.some((d) => /chat_session .*\(last_activity_at DESC\)/.test(d))).toBe(true);
        expect(defs.some((d) => /chat_message .*\(session_id, id\)/.test(d))).toBe(true);
    });
});
