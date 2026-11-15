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

describe.skipIf(adminUrl === undefined)('028_portal_catalog migration', () => {
    const dbName = `portal_cat_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let productId: string;
    let agentId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertProduct = async (slug: string): Promise<string> => {
        const rows = await query(
            `INSERT INTO portal_products (slug, name) VALUES ($1, 'Продукт') RETURNING id`,
            [slug],
        );
        return String(rows[0]?.id);
    };

    const insertAgent = async (product: string, slug: string): Promise<string> => {
        const rows = await query(
            `INSERT INTO portal_agents (slug, name) VALUES ($1, 'Агент') RETURNING id`,
            [slug],
        );
        const id = String(rows[0]?.id);
        await query(`INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)`, [
            id,
            product,
        ]);
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
        productId = await insertProduct('product-a');
        agentId = await insertAgent(productId, 'agent-a');
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates the three catalog tables', async () => {
        const tables = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_name IN ('portal_products', 'portal_agents', 'portal_skills')
             ORDER BY table_name`,
        );
        expect(tables.map((t) => t.table_name)).toEqual([
            'portal_agents',
            'portal_products',
            'portal_skills',
        ]);
    });

    it('rejects a duplicate product slug', async () => {
        await expect(insertProduct('product-a')).rejects.toThrow(/duplicate key/);
    });

    it('rejects a duplicate agent slug', async () => {
        await expect(insertAgent(productId, 'agent-a')).rejects.toThrow(/duplicate key/);
    });

    it('rejects an agent without an existing product', async () => {
        await expect(insertAgent(randomUUID(), 'agent-orphan')).rejects.toThrow(/foreign key/);
    });

    it('defaults description to empty text and sets both timestamps', async () => {
        const [row] = await query(
            `INSERT INTO portal_skills (agent_id, name, status) VALUES ($1, 'Навык', 'planned')
             RETURNING description, created_at, status_changed_at`,
            [agentId],
        );
        expect(row.description).toBe('');
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.status_changed_at).toBeInstanceOf(Date);
    });

    it('accepts every known status', async () => {
        for (const status of ['planned', 'in_dev', 'testing', 'launched']) {
            await query(
                `INSERT INTO portal_skills (agent_id, name, status, launched_at)
                 VALUES ($1, 'Н', $2, CASE WHEN $2 = 'launched' THEN now() END)`,
                [agentId, status],
            );
        }
    });

    it('rejects an unknown status', async () => {
        await expect(
            query(`INSERT INTO portal_skills (agent_id, name, status) VALUES ($1, 'Н', 'done')`, [
                agentId,
            ]),
        ).rejects.toThrow(/check constraint/);
    });

    it('rejects a skill without an existing agent', async () => {
        await expect(
            query(
                `INSERT INTO portal_skills (agent_id, name, status) VALUES ($1, 'Н', 'planned')`,
                [randomUUID()],
            ),
        ).rejects.toThrow(/foreign key/);
    });

    it('rejects a skill without status or agent', async () => {
        await expect(
            query(`INSERT INTO portal_skills (name, status) VALUES ('Н', 'planned')`),
        ).rejects.toThrow(/null value in column "agent_id"/);
        await expect(
            query(`INSERT INTO portal_skills (agent_id, name) VALUES ($1, 'Н')`, [agentId]),
        ).rejects.toThrow(/null value in column "status"/);
    });

    it('indexes skills by agent and by status', async () => {
        const defs = (
            await query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'portal_skills'`)
        ).map((r) => String(r.indexdef));
        expect(defs.some((d) => d.includes('(agent_id)'))).toBe(true);
        expect(defs.some((d) => d.includes('(status)'))).toBe(true);
    });
});
