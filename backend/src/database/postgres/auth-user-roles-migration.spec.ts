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

describe.skipIf(adminUrl === undefined)('027_auth_user_roles migration', () => {
    const dbName = `auth_roles_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let userId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '027');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        userId = String(rows[0]?.id);

        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates auth_user_roles with a composite primary key', async () => {
        const columns = await query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = 'auth_user_roles' ORDER BY column_name`,
        );
        expect(columns.map((c) => c.column_name)).toEqual(['role', 'user_id']);

        const pk = await query(
            `SELECT a.attname FROM pg_index i
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
             WHERE i.indrelid = 'auth_user_roles'::regclass AND i.indisprimary
             ORDER BY a.attname`,
        );
        expect(pk.map((c) => c.attname)).toEqual(['role', 'user_id']);
    });

    it('accepts the developer role', async () => {
        await query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')`, [
            userId,
        ]);

        const rows = await query('SELECT role FROM auth_user_roles WHERE user_id = $1', [userId]);
        expect(rows).toEqual([{ role: 'developer' }]);
    });

    it('rejects a role outside the closed set', async () => {
        await expect(
            query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'superuser')`, [userId]),
        ).rejects.toThrow(/check constraint/);
    });

    it('rejects a duplicate (user_id, role)', async () => {
        await expect(
            query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')`, [userId]),
        ).rejects.toThrow(/duplicate key/);
    });

    it('references auth_users', async () => {
        await expect(
            query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')`, [
                randomUUID(),
            ]),
        ).rejects.toThrow(/foreign key/);
    });

    it('deletes roles together with the user', async () => {
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        const other = String(rows[0]?.id);
        await query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')`, [
            other,
        ]);

        await query('DELETE FROM auth_users WHERE id = $1', [other]);

        expect(
            await query('SELECT 1 FROM auth_user_roles WHERE user_id = $1', [other]),
        ).toHaveLength(0);
    });
});
