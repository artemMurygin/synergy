import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'db', 'migrations');
const TARGET = '034_portal_catalog_archive.sql';

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('034_portal_catalog_archive migration', () => {
    const dbName = `portal_arc_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let dbUrl: string;
    let tmpDir: string;
    let productA: string;
    let productB: string;
    let agentOne: string;
    let agentTwo: string;
    let launchedSkill: string;
    let plannedSkill: string;
    const launchedChangedAt = new Date('2025-03-01T10:00:00.000Z');

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const link = (agent: string, product: string): Promise<unknown> =>
        query(`INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)`, [
            agent,
            product,
        ]);

    const insertSkill = async (status: string, extra = ''): Promise<unknown> =>
        query(
            `INSERT INTO portal_skills (agent_id, name, status${extra ? ', launched_at' : ''})
             VALUES ($1, 'Н', $2${extra ? ', now()' : ''})`,
            [agentOne, status],
        );

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        dbUrl = withDatabase(adminUrl ?? '', dbName);

        // Сначала применяем всё до 034 и наполняем данными старой схемы
        tmpDir = await mkdtemp(join(tmpdir(), 'mig034-'));
        for (const f of (await readdir(MIGRATIONS_DIR)).filter((n) => n < TARGET)) {
            await copyFile(join(MIGRATIONS_DIR, f), join(tmpDir, f));
        }
        await migrate(dbUrl, tmpDir);

        client = new Client({ connectionString: dbUrl });
        await client.connect();
        productA = String(
            (
                await query(
                    `INSERT INTO portal_products (slug, name) VALUES ('pa', 'A') RETURNING id`,
                )
            )[0]?.id,
        );
        productB = String(
            (
                await query(
                    `INSERT INTO portal_products (slug, name) VALUES ('pb', 'B') RETURNING id`,
                )
            )[0]?.id,
        );
        agentOne = String(
            (
                await query(
                    `INSERT INTO portal_agents (product_id, slug, name) VALUES ($1, 'a1', 'А1') RETURNING id`,
                    [productA],
                )
            )[0]?.id,
        );
        agentTwo = String(
            (
                await query(
                    `INSERT INTO portal_agents (product_id, slug, name) VALUES ($1, 'a2', 'А2') RETURNING id`,
                    [productB],
                )
            )[0]?.id,
        );
        launchedSkill = String(
            (
                await query(
                    `INSERT INTO portal_skills (agent_id, name, status, status_changed_at)
                     VALUES ($1, 'Запущен', 'launched', $2) RETURNING id`,
                    [agentOne, launchedChangedAt],
                )
            )[0]?.id,
        );
        plannedSkill = String(
            (
                await query(
                    `INSERT INTO portal_skills (agent_id, name, status) VALUES ($1, 'План', 'planned') RETURNING id`,
                    [agentTwo],
                )
            )[0]?.id,
        );

        await migrate(dbUrl); // применяет 034 поверх данных
    }, 60_000);

    afterAll(async () => {
        await client.end();
        await rm(tmpDir, { recursive: true, force: true });
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('carries every agent-product pair over and drops portal_agents.product_id', async () => {
        const pairs = await query(
            `SELECT agent_id, product_id FROM portal_agent_products ORDER BY agent_id`,
        );
        expect(pairs).toHaveLength(2);
        expect(pairs).toEqual(
            expect.arrayContaining([
                { agent_id: agentOne, product_id: productA },
                { agent_id: agentTwo, product_id: productB },
            ]),
        );
        const cols = await query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = 'portal_agents' AND column_name = 'product_id'`,
        );
        expect(cols).toHaveLength(0);
    });

    it('keeps existing agents and skills', async () => {
        expect(await query(`SELECT 1 FROM portal_agents`)).toHaveLength(2);
        expect(await query(`SELECT 1 FROM portal_skills`)).toHaveLength(2);
    });

    it('allows an agent in two products and rejects a duplicate pair', async () => {
        await link(agentOne, productB);
        const rows = await query(`SELECT 1 FROM portal_agent_products WHERE agent_id = $1`, [
            agentOne,
        ]);
        expect(rows).toHaveLength(2);
        await expect(link(agentOne, productB)).rejects.toThrow(/duplicate key/);
    });

    it('rejects a link to a missing agent or product', async () => {
        await expect(link(randomUUID(), productA)).rejects.toThrow(/foreign key/);
        await expect(link(agentTwo, randomUUID())).rejects.toThrow(/foreign key/);
    });

    it('fills launched_at from status_changed_at for launched skills only', async () => {
        const [launched] = await query(
            `SELECT launched_at, archived_at FROM portal_skills WHERE id = $1`,
            [launchedSkill],
        );
        expect((launched.launched_at as Date).toISOString()).toBe(launchedChangedAt.toISOString());
        expect(launched.archived_at).toBeNull();
        const [planned] = await query(
            `SELECT launched_at, archived_at FROM portal_skills WHERE id = $1`,
            [plannedSkill],
        );
        expect(planned.launched_at).toBeNull();
        expect(planned.archived_at).toBeNull();
    });

    it('adds a nullable archived_at to agents', async () => {
        const [row] = await query(`SELECT archived_at FROM portal_agents WHERE id = $1`, [
            agentOne,
        ]);
        expect(row.archived_at).toBeNull();
    });

    it('accepts rework and rejects an unknown status', async () => {
        await expect(insertSkill('rework')).resolves.toBeDefined();
        await expect(insertSkill('done')).rejects.toThrow(/check constraint/);
    });

    it('rejects a launched skill without launched_at', async () => {
        await expect(insertSkill('launched')).rejects.toThrow(/portal_skills_launched_has_time/);
        await expect(insertSkill('launched', 'with-time')).resolves.toBeDefined();
    });
});
