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
const TARGET = '035_portal_request_review.sql';

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('035_portal_request_review migration', () => {
    const dbName = `portal_rev_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let dbUrl: string;
    let tmpDir: string;
    let userId: string;
    let skillId: string;
    let pendingId: string;
    let acceptedId: string;
    let rejectedId: string;
    const decidedAt = new Date('2025-04-01T10:00:00.000Z');

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertedId = async (sql: string, params: unknown[]): Promise<string> =>
        String((await query(sql, params))[0]?.id);

    const insertRequest = (
        decision: string,
        extra: Record<string, unknown> = {},
    ): Promise<unknown> => {
        const cols = [
            'author_id',
            'title',
            'description',
            'frequency_count',
            'frequency_period',
            'minutes_per_run',
            'people_count',
            'decision',
            ...Object.keys(extra),
        ];
        const vals = [userId, 'Т', 'О', 1, 'day', 1, 1, decision, ...Object.values(extra)];
        const marks = vals.map((_, i) => '$' + String(i + 1)).join(', ');
        return query(`INSERT INTO portal_requests (${cols.join(', ')}) VALUES (${marks})`, vals);
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        dbUrl = withDatabase(adminUrl ?? '', dbName);

        // Сначала применяем всё до 035 и наполняем данными старой схемы
        tmpDir = await mkdtemp(join(tmpdir(), 'mig035-'));
        for (const f of (await readdir(MIGRATIONS_DIR)).filter((n) => n < TARGET)) {
            await copyFile(join(MIGRATIONS_DIR, f), join(tmpDir, f));
        }
        await migrate(dbUrl, tmpDir);

        client = new Client({ connectionString: dbUrl });
        await client.connect();
        userId = await insertedId(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'x') RETURNING id`,
            [`u_${randomUUID().slice(0, 8)}`],
        );
        const productId = await insertedId(
            `INSERT INTO portal_products (slug, name) VALUES ('pa', 'Продукт') RETURNING id`,
            [],
        );
        const agentId = await insertedId(
            `INSERT INTO portal_agents (slug, name) VALUES ('a1', 'Агент') RETURNING id`,
            [],
        );
        await query(`INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)`, [
            agentId,
            productId,
        ]);
        skillId = await insertedId(
            `INSERT INTO portal_skills (agent_id, name, status) VALUES ($1, 'Н', 'planned') RETURNING id`,
            [agentId],
        );
        const base = `INSERT INTO portal_requests
            (author_id, title, description, frequency_count, frequency_period, minutes_per_run, people_count`;
        pendingId = await insertedId(
            `${base}, decision) VALUES ($1, 'P', 'o', 1, 'day', 1, 1, 'pending') RETURNING id`,
            [userId],
        );
        acceptedId = await insertedId(
            `${base}, decision, skill_id, decided_by, decided_at)
             VALUES ($1, 'A', 'o', 1, 'day', 1, 1, 'accepted', $2, $1, $3) RETURNING id`,
            [userId, skillId, decidedAt],
        );
        rejectedId = await insertedId(
            `${base}, decision, reject_reason, decided_by, decided_at)
             VALUES ($1, 'R', 'o', 1, 'day', 1, 1, 'rejected', 'нет', $1, $2) RETURNING id`,
            [userId, decidedAt],
        );

        await migrate(dbUrl); // применяет 035 поверх данных
    }, 60_000);

    afterAll(async () => {
        await client.end();
        await rm(tmpDir, { recursive: true, force: true });
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('keeps all existing requests and renames pending to new', async () => {
        expect(await query(`SELECT 1 FROM portal_requests`)).toHaveLength(3);
        const [row] = await query(
            `SELECT decision, reviewer_id, taken_at FROM portal_requests WHERE id = $1`,
            [pendingId],
        );
        expect(row).toEqual({ decision: 'new', reviewer_id: null, taken_at: null });
    });

    it('copies decided_by/decided_at into reviewer_id/taken_at for decided requests', async () => {
        for (const id of [acceptedId, rejectedId]) {
            const [row] = await query(
                `SELECT reviewer_id, taken_at, effort_hours FROM portal_requests WHERE id = $1`,
                [id],
            );
            expect(row.reviewer_id).toBe(userId);
            expect((row.taken_at as Date).toISOString()).toBe(decidedAt.toISOString());
            expect(row.effort_hours).toBeNull();
        }
    });

    it('rejects the old pending value', async () => {
        await expect(insertRequest('pending')).rejects.toThrow(/check constraint/);
    });

    it('accepts under_review with a reviewer', async () => {
        await expect(
            insertRequest('under_review', { reviewer_id: userId, taken_at: new Date() }),
        ).resolves.toBeDefined();
    });

    it('requires new <=> no reviewer, and reviewer <=> taken_at', async () => {
        await expect(
            insertRequest('new', { reviewer_id: userId, taken_at: new Date() }),
        ).rejects.toThrow(/portal_requests_new_has_no_reviewer/);
        await expect(insertRequest('under_review')).rejects.toThrow(
            /portal_requests_new_has_no_reviewer/,
        );
        await expect(insertRequest('under_review', { reviewer_id: userId })).rejects.toThrow(
            /portal_requests_reviewer_has_taken_at/,
        );
    });

    it('allows effort_hours only on accepted and only when positive', async () => {
        const accepted = {
            skill_id: skillId,
            decided_by: userId,
            decided_at: new Date(),
            reviewer_id: userId,
            taken_at: new Date(),
        };
        await expect(
            insertRequest('accepted', { ...accepted, effort_hours: 16 }),
        ).resolves.toBeDefined();
        await expect(insertRequest('accepted', accepted)).resolves.toBeDefined();
        await expect(insertRequest('accepted', { ...accepted, effort_hours: 0 })).rejects.toThrow(
            /portal_requests_effort_positive/,
        );
        await expect(
            insertRequest('under_review', {
                reviewer_id: userId,
                taken_at: new Date(),
                effort_hours: 8,
            }),
        ).rejects.toThrow(/portal_requests_effort_only_when_accepted/);
    });

    it('keeps the 029 invariants', async () => {
        const taken = { reviewer_id: userId, taken_at: new Date() };
        await expect(insertRequest('accepted', taken)).rejects.toThrow(
            /portal_requests_accepted_has_skill/,
        );
        await expect(insertRequest('rejected', taken)).rejects.toThrow(
            /portal_requests_rejected_has_reason/,
        );
        await expect(
            insertRequest('under_review', { ...taken, reject_reason: 'x' }),
        ).rejects.toThrow(/portal_requests_reason_only_when_rejected/);
    });

    it('rebuilds the queue index for new and under_review', async () => {
        const [row] = await query(
            `SELECT indexdef FROM pg_indexes WHERE indexname = 'portal_requests_pending_idx'`,
        );
        expect(String(row.indexdef)).toMatch(/new/);
        expect(String(row.indexdef)).toMatch(/under_review/);
    });

    it('rejects case-insensitive duplicate agent and product names', async () => {
        await expect(
            query(`INSERT INTO portal_products (slug, name) VALUES ('pz', '  ПРОДУКТ ')`),
        ).rejects.toThrow(/portal_products_name_uq/);
        await expect(
            query(`INSERT INTO portal_agents (slug, name) VALUES ('az', 'агент')`),
        ).rejects.toThrow(/portal_agents_name_uq/);
    });
});
