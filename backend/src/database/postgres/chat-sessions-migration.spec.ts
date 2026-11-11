import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'db', 'migrations');

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

    const createUser = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'h') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    const createSession = async (channel = 'app'): Promise<string> => {
        const ownerId = await createUser();
        const rows = await query(
            `INSERT INTO chat_session (title, owner_id, channel) VALUES ('t', $1, $2) RETURNING id`,
            [ownerId, channel],
        );
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

    it('creates indexes on (owner_id, last_activity_at) and (session_id, id)', async () => {
        const rows = await query(
            `SELECT indexdef FROM pg_indexes
             WHERE tablename IN ('chat_session', 'chat_message') AND indexname NOT LIKE '%pkey'`,
        );
        const defs = rows.map((r) => String(r.indexdef));
        expect(defs.some((d) => /chat_session .*\(owner_id, last_activity_at DESC\)/.test(d))).toBe(
            true,
        );
        expect(defs.some((d) => /chat_message .*\(session_id, id\)/.test(d))).toBe(true);
    });

    it('adds NOT NULL owner_id and channel columns', async () => {
        const rows = await query(
            `SELECT column_name, is_nullable FROM information_schema.columns
             WHERE table_name = 'chat_session' AND column_name IN ('owner_id', 'channel')`,
        );
        expect(rows.map((r) => `${String(r.column_name)}:${String(r.is_nullable)}`).sort()).toEqual(
            ['channel:NO', 'owner_id:NO'],
        );
    });

    it('rejects a session without an existing owner', async () => {
        await expect(
            query(`INSERT INTO chat_session (title, owner_id, channel) VALUES ('t', $1, 'app')`, [
                randomUUID(),
            ]),
        ).rejects.toThrow();
    });

    it('rejects an unknown channel', async () => {
        await expect(createSession('sms')).rejects.toThrow();
    });

    it('allows one telegram session per owner and many app sessions', async () => {
        const ownerId = await createUser();
        const insert = (channel: string): Promise<Record<string, unknown>[]> =>
            query(`INSERT INTO chat_session (title, owner_id, channel) VALUES ('t', $1, $2)`, [
                ownerId,
                channel,
            ]);
        await insert('app');
        await insert('app');
        await insert('telegram');
        await expect(insert('telegram')).rejects.toThrow();
    });

    it('creates the list index on (owner_id, last_activity_at DESC)', async () => {
        const rows = await query(
            `SELECT indexdef FROM pg_indexes WHERE tablename = 'chat_session'`,
        );
        const defs = rows.map((r) => String(r.indexdef));
        expect(defs.some((d) => d.includes('(owner_id, last_activity_at DESC)'))).toBe(true);
    });

    it('deletes the sessions of a removed user', async () => {
        const sessionId = await createSession();
        const owner = await query('SELECT owner_id FROM chat_session WHERE id = $1', [sessionId]);
        await query('DELETE FROM auth_users WHERE id = $1', [String(owner[0]?.owner_id)]);
        expect(await query('SELECT 1 FROM chat_session WHERE id = $1', [sessionId])).toHaveLength(
            0,
        );
    });
});

describe.skipIf(adminUrl === undefined)('019_assistant_chats migration data reset', () => {
    const dbName = `chat_mig19_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        // Bring the schema to 018, add legacy chats and checkpointer data, then apply 019.
        const before019 = await mkdtemp(join(tmpdir(), 'migrations-018-'));
        for (const name of (await readdir(MIGRATIONS_DIR)).filter((f) => f < '019')) {
            await copyFile(join(MIGRATIONS_DIR, name), join(before019, name));
        }
        await migrate(dbUrl, before019);
        await rm(before019, { recursive: true, force: true });
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        await client.query(`INSERT INTO chat_session (title) VALUES ('old')`);
        await client.query(`CREATE TABLE checkpoints (thread_id TEXT)`);
        await client.query(`CREATE TABLE checkpoint_blobs (thread_id TEXT)`);
        await client.query(`CREATE TABLE checkpoint_writes (thread_id TEXT)`);
        await client.query(`INSERT INTO checkpoints VALUES ('t')`);
        await client.query(`INSERT INTO checkpoint_blobs VALUES ('t')`);
        await client.query(`INSERT INTO checkpoint_writes VALUES ('t')`);
        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('removes legacy chats and checkpointer data', async () => {
        for (const table of [
            'chat_session',
            'checkpoints',
            'checkpoint_blobs',
            'checkpoint_writes',
        ]) {
            const rows = await client.query(`SELECT 1 FROM ${table}`);
            expect(rows.rowCount, table).toBe(0);
        }
    });
});
