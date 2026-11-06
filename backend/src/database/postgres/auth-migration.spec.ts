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

describe.skipIf(adminUrl === undefined)('013_auth migration', () => {
    const dbName = `auth_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createUser = async (login = 'ivan'): Promise<string> => {
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [login],
        );
        return String(rows[0]?.id);
    };

    const createSession = async (userId: string): Promise<string> => {
        const rows = await query(`INSERT INTO auth_sessions (user_id) VALUES ($1) RETURNING id`, [
            userId,
        ]);
        return String(rows[0]?.id);
    };

    const createToken = async (sessionId: string, hash: string): Promise<void> => {
        await query(
            `INSERT INTO auth_refresh_tokens (session_id, token_hash, expires_at)
             VALUES ($1, $2, now() + interval '1 day')`,
            [sessionId, hash],
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

    it('creates the three auth tables', async () => {
        const rows = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'auth\\_%'`,
        );
        expect(rows.map((r) => r.table_name).sort()).toEqual([
            'auth_refresh_tokens',
            'auth_sessions',
            'auth_users',
        ]);
    });

    it('applies defaults to users', async () => {
        const id = await createUser('defaults');
        const [row] = await query(
            `SELECT must_change_password, is_active, password_changed_at, created_at
             FROM auth_users WHERE id = $1`,
            [id],
        );
        expect(row.must_change_password).toBe(true);
        expect(row.is_active).toBe(true);
        expect(row.password_changed_at).toBeNull();
        expect(row.created_at).toBeInstanceOf(Date);
    });

    it('enforces case-insensitive login uniqueness', async () => {
        await createUser('Petr');
        await expect(createUser('PETR')).rejects.toThrow();
    });

    it('creates a unique index on lower(login)', async () => {
        const rows = await query(
            `SELECT indexdef FROM pg_indexes WHERE tablename = 'auth_users' AND indexname NOT LIKE '%pkey'`,
        );
        expect(rows.some((r) => /UNIQUE INDEX .*\(lower\(login\)\)/.test(String(r.indexdef)))).toBe(
            true,
        );
    });

    it('rejects sessions of an unknown user', async () => {
        await expect(createSession(randomUUID())).rejects.toThrow();
    });

    it('rejects duplicate token hashes', async () => {
        const sessionId = await createSession(await createUser('dup'));
        await createToken(sessionId, 'same-hash');
        await expect(createToken(sessionId, 'same-hash')).rejects.toThrow();
    });

    it('rejects tokens of an unknown session', async () => {
        await expect(createToken(randomUUID(), 'orphan')).rejects.toThrow();
    });

    it('creates an index on auth_refresh_tokens(session_id)', async () => {
        const rows = await query(
            `SELECT indexdef FROM pg_indexes WHERE tablename = 'auth_refresh_tokens'`,
        );
        expect(rows.some((r) => String(r.indexdef).includes('(session_id)'))).toBe(true);
    });

    it('cascades user deletion to sessions and tokens', async () => {
        const userId = await createUser('cascade');
        const sessionId = await createSession(userId);
        await createToken(sessionId, 'cascade-hash');
        await query('DELETE FROM auth_users WHERE id = $1', [userId]);
        expect(await query('SELECT 1 FROM auth_sessions WHERE id = $1', [sessionId])).toHaveLength(
            0,
        );
        expect(
            await query('SELECT 1 FROM auth_refresh_tokens WHERE session_id = $1', [sessionId]),
        ).toHaveLength(0);
    });
});
