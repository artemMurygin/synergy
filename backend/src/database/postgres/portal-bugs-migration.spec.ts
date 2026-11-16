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

describe.skipIf(adminUrl === undefined)('037_portal_bugs migration', () => {
    const dbName = `portal_bug_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let userId: string;
    let productId: string;
    let agentId: string;
    const at = new Date('2025-05-01T10:00:00.000Z');

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertBug = (
        extra: {
            title?: string;
            description?: string;
            status?: string;
            reason?: string | null;
        } = {},
    ): Promise<unknown> =>
        query(
            `INSERT INTO portal_bugs
                (id, author_id, product_id, agent_id, title, description, status, wont_fix_reason, created_at, status_changed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
            [
                randomUUID(),
                userId,
                productId,
                agentId,
                extra.title ?? 'Заголовок',
                extra.description ?? 'Описание',
                extra.status ?? 'open',
                extra.reason ?? null,
                at,
            ],
        );

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
        productId = String(
            (
                await query(
                    `INSERT INTO portal_products (slug, name) VALUES ($1, 'П') RETURNING id`,
                    [`p_${randomUUID().slice(0, 8)}`],
                )
            )[0]?.id,
        );
        agentId = String(
            (
                await query(
                    `INSERT INTO portal_agents (slug, name) VALUES ($1, 'А') RETURNING id`,
                    [`a_${randomUUID().slice(0, 8)}`],
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

    it('inserts valid bugs in every status', async () => {
        await expect(insertBug()).resolves.toBeDefined();
        await expect(insertBug({ status: 'in_progress' })).resolves.toBeDefined();
        await expect(insertBug({ status: 'resolved' })).resolves.toBeDefined();
        await expect(insertBug({ status: 'wont_fix', reason: 'дубль' })).resolves.toBeDefined();
    });

    it('rejects blank title and description and an unknown status', async () => {
        await expect(insertBug({ title: '   ' })).rejects.toThrow(/check constraint/);
        await expect(insertBug({ title: 'x'.repeat(201) })).rejects.toThrow(/check constraint/);
        await expect(insertBug({ description: '' })).rejects.toThrow(/check constraint/);
        await expect(insertBug({ description: 'x'.repeat(4001) })).rejects.toThrow(
            /check constraint/,
        );
        await expect(insertBug({ status: 'closed' })).rejects.toThrow(/check constraint/);
    });

    it('requires a reason exactly for wont_fix', async () => {
        await expect(insertBug({ status: 'wont_fix' })).rejects.toThrow(/check constraint/);
        await expect(insertBug({ status: 'open', reason: 'зачем' })).rejects.toThrow(
            /check constraint/,
        );
        await expect(insertBug({ status: 'wont_fix', reason: '' })).rejects.toThrow(
            /check constraint/,
        );
    });

    it('deletes comments together with the bug and rejects comments on a missing bug', async () => {
        const bugId = randomUUID();
        await query(
            `INSERT INTO portal_bugs (id, author_id, product_id, agent_id, title, description, status, created_at, status_changed_at)
             VALUES ($1, $2, $3, $4, 'Т', 'О', 'open', $5, $5)`,
            [bugId, userId, productId, agentId, at],
        );
        const insertComment = (target: string, body: string): Promise<unknown> =>
            query(
                `INSERT INTO portal_bug_comments (id, bug_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
                [randomUUID(), target, userId, body, at],
            );
        await insertComment(bugId, 'ок');
        await expect(insertComment(bugId, '')).rejects.toThrow(/check constraint/);
        await expect(insertComment(randomUUID(), 'a')).rejects.toThrow(/foreign key constraint/);
        await query(`DELETE FROM portal_bugs WHERE id = $1`, [bugId]);
        expect(
            await query(`SELECT 1 FROM portal_bug_comments WHERE bug_id = $1`, [bugId]),
        ).toHaveLength(0);
    });

    it('has the indexes', async () => {
        const rows = await query(
            `SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('portal_bugs', 'portal_bug_comments')`,
        );
        const defs = rows.map((row) => String(row.indexdef)).join('\n');
        expect(defs).toMatch(/\(author_id, created_at DESC, id\)/);
        expect(defs).toMatch(/\(status, created_at, id\)/);
        expect(defs).toMatch(/\(bug_id, created_at, id\)/);
    });

    it('rolls back with the documented DROP statements', async () => {
        await query('DROP TABLE portal_bug_comments');
        await query('DROP TABLE portal_bugs');
        expect(
            await query(
                `SELECT 1 FROM pg_tables WHERE tablename IN ('portal_bugs', 'portal_bug_comments')`,
            ),
        ).toHaveLength(0);
    });
});
