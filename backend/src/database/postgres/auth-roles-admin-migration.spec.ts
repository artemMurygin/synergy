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

describe.skipIf(adminUrl === undefined)('031_auth_roles_admin migration', () => {
    const dbName = `auth_roles_admin_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let existingUserId: string;
    let userId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createUser = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '031');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        existingUserId = await createUser();
        await query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')`, [
            existingUserId,
        ]);

        await migrate(dbUrl);
        userId = await createUser();
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('keeps rows that existed before the migration', async () => {
        const rows = await query('SELECT role FROM auth_user_roles WHERE user_id = $1', [
            existingUserId,
        ]);
        expect(rows).toEqual([{ role: 'developer' }]);
    });

    it('accepts the developer role', async () => {
        await query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')`, [
            userId,
        ]);
        const rows = await query('SELECT role FROM auth_user_roles WHERE user_id = $1', [userId]);
        expect(rows).toEqual([{ role: 'developer' }]);
    });

    it('accepts the admin role and allows two roles for one user', async () => {
        await query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'admin')`, [userId]);
        const rows = await query(
            'SELECT role FROM auth_user_roles WHERE user_id = $1 ORDER BY role',
            [userId],
        );
        expect(rows).toEqual([{ role: 'admin' }, { role: 'developer' }]);
    });

    it('rejects an unknown role', async () => {
        await expect(
            query(`INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'superuser')`, [userId]),
        ).rejects.toThrow(/check constraint/);
    });
});
