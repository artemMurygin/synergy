import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('038_portal_guides_product_access migration', () => {
    const dbName = `portal_guide_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let userId: string;
    let agentId: string;
    let productId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertGuide = (body: string, id: string = agentId): Promise<unknown> =>
        query(
            `INSERT INTO portal_agent_guides (agent_id, body, updated_by, updated_at)
             VALUES ($1, $2, $3, now())`,
            [id, body, userId],
        );

    const insertDepartment = async (): Promise<string> => {
        const id = `d_${randomUUID().slice(0, 8)}`;
        await query(`INSERT INTO auth_departments (id, name) VALUES ($1, $1)`, [id]);
        return id;
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
        userId = String(
            (
                await query(
                    `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'x') RETURNING id`,
                    [`u_${randomUUID().slice(0, 8)}`],
                )
            )[0]?.id,
        );
        agentId = String(
            (
                await query(
                    `INSERT INTO portal_agents (slug, name) VALUES ('a-guide', 'Агент') RETURNING id`,
                )
            )[0]?.id,
        );
        productId = String(
            (
                await query(
                    `INSERT INTO portal_products (slug, name) VALUES ('p-guide', 'Продукт') RETURNING id`,
                )
            )[0]?.id,
        );
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('inserts a valid guide and keeps one row per agent', async () => {
        await expect(insertGuide('x'.repeat(50000))).resolves.toBeDefined();
        await expect(insertGuide('второй')).rejects.toThrow(/duplicate key/);
    });

    it('rejects empty and oversized guide body', async () => {
        const other = String(
            (
                await query(
                    `INSERT INTO portal_agents (slug, name) VALUES ('a-g2', 'А2') RETURNING id`,
                )
            )[0]?.id,
        );
        await expect(insertGuide('', other)).rejects.toThrow(/check constraint/);
        await expect(insertGuide('x'.repeat(50001), other)).rejects.toThrow(/check constraint/);
    });

    it('rejects a guide of a missing agent', async () => {
        await expect(insertGuide('a', randomUUID())).rejects.toThrow(/foreign key constraint/);
    });

    it('rejects a product mark for a missing department', async () => {
        await expect(
            query(
                `INSERT INTO portal_product_departments (product_id, department_id) VALUES ($1, 'нет')`,
                [productId],
            ),
        ).rejects.toThrow(/foreign key constraint/);
    });

    it('rejects a duplicate product-department pair', async () => {
        const dep = await insertDepartment();
        const insert = (): Promise<unknown> =>
            query(
                `INSERT INTO portal_product_departments (product_id, department_id) VALUES ($1, $2)`,
                [productId, dep],
            );
        await insert();
        await expect(insert()).rejects.toThrow(/duplicate key/);
    });

    it('removes product marks when the department is deleted', async () => {
        const dep = await insertDepartment();
        await query(
            `INSERT INTO portal_product_departments (product_id, department_id) VALUES ($1, $2)`,
            [productId, dep],
        );
        await query(`DELETE FROM auth_departments WHERE id = $1`, [dep]);
        expect(
            await query(`SELECT 1 FROM portal_product_departments WHERE department_id = $1`, [dep]),
        ).toHaveLength(0);
    });

    it('has the department index', async () => {
        const [row] = await query(
            `SELECT indexdef FROM pg_indexes WHERE indexname = 'portal_product_departments_department_idx'`,
        );
        expect(String(row.indexdef)).toMatch(/\(department_id\)/);
    });
});
