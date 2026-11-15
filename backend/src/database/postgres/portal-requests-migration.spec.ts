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

interface RequestOverrides {
    frequency_count?: number;
    minutes_per_run?: number;
    people_count?: number;
    frequency_period?: string;
    decision?: string;
    skill_id?: string | null;
    reject_reason?: string | null;
    decided_by?: string | null;
    decided_at?: string | null;
    reviewer_id?: string | null;
    taken_at?: string | null;
}

describe.skipIf(adminUrl === undefined)('029_portal_requests migration', () => {
    const dbName = `portal_req_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let authorId: string;
    let developerId: string;
    let skillId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createUser = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    const insertRequest = async (o: RequestOverrides = {}): Promise<Record<string, unknown>[]> => {
        const v = {
            frequency_count: 3,
            frequency_period: 'week',
            minutes_per_run: 15,
            people_count: 2,
            decision: 'new',
            skill_id: null,
            reject_reason: null,
            decided_by: null,
            decided_at: null,
            reviewer_id: null,
            taken_at: null,
            ...o,
        };
        return query(
            `INSERT INTO portal_requests
                (author_id, title, description, frequency_count, frequency_period,
                 minutes_per_run, people_count, decision, skill_id, reject_reason,
                 decided_by, decided_at, reviewer_id, taken_at)
             VALUES ($1, 'Заявка', 'Описание', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id`,
            [
                authorId,
                v.frequency_count,
                v.frequency_period,
                v.minutes_per_run,
                v.people_count,
                v.decision,
                v.skill_id,
                v.reject_reason,
                v.decided_by,
                v.decided_at,
                v.reviewer_id,
                v.taken_at,
            ],
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
        authorId = await createUser();
        developerId = await createUser();
        const [product] = await query(
            `INSERT INTO portal_products (slug, name) VALUES ('p', 'П') RETURNING id`,
        );
        const [agent] = await query(
            `INSERT INTO portal_agents (slug, name) VALUES ('a', 'А') RETURNING id`,
        );
        await query(`INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)`, [
            agent.id,
            product.id,
        ]);
        const [skill] = await query(
            `INSERT INTO portal_skills (agent_id, name, status) VALUES ($1, 'Н', 'planned') RETURNING id`,
            [agent.id],
        );
        skillId = String(skill.id);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('stores a new request and fills created_at', async () => {
        const [inserted] = await insertRequest();
        const [row] = await query(
            'SELECT decision, skill_id, reject_reason, created_at FROM portal_requests WHERE id = $1',
            [inserted.id],
        );
        expect(row.decision).toBe('new');
        expect(row.skill_id).toBeNull();
        expect(row.reject_reason).toBeNull();
        expect(row.created_at).toBeInstanceOf(Date);
    });

    it('accepts an accepted request linked to a skill', async () => {
        await expect(
            insertRequest({
                decision: 'accepted',
                skill_id: skillId,
                decided_by: developerId,
                decided_at: new Date().toISOString(),
                reviewer_id: developerId,
                taken_at: new Date().toISOString(),
            }),
        ).resolves.toHaveLength(1);
    });

    it('accepts a rejected request with a reason', async () => {
        await expect(
            insertRequest({
                decision: 'rejected',
                reject_reason: 'Дубликат',
                decided_by: developerId,
                decided_at: new Date().toISOString(),
                reviewer_id: developerId,
                taken_at: new Date().toISOString(),
            }),
        ).resolves.toHaveLength(1);
    });

    it('rejects accepted without a skill', async () => {
        await expect(insertRequest({ decision: 'accepted' })).rejects.toThrow(/check constraint/);
    });

    it('rejects a skill on a pending request', async () => {
        await expect(insertRequest({ skill_id: skillId })).rejects.toThrow(/check constraint/);
    });

    it('rejects rejected without a reason or with a blank reason', async () => {
        await expect(insertRequest({ decision: 'rejected' })).rejects.toThrow(/check constraint/);
        await expect(insertRequest({ decision: 'rejected', reject_reason: '   ' })).rejects.toThrow(
            /check constraint/,
        );
    });

    it('rejects a reason on a non-rejected request', async () => {
        await expect(insertRequest({ reject_reason: 'Причина' })).rejects.toThrow(
            /check constraint/,
        );
    });

    it('rejects an unknown decision and an unknown period', async () => {
        await expect(insertRequest({ decision: 'maybe' })).rejects.toThrow(/check constraint/);
        await expect(insertRequest({ frequency_period: 'year' })).rejects.toThrow(
            /check constraint/,
        );
    });

    it('rejects non-positive questionnaire numbers', async () => {
        await expect(insertRequest({ frequency_count: 0 })).rejects.toThrow(/check constraint/);
        await expect(insertRequest({ minutes_per_run: 0 })).rejects.toThrow(/check constraint/);
        await expect(insertRequest({ people_count: -1 })).rejects.toThrow(/check constraint/);
    });

    it('references auth_users and portal_skills', async () => {
        await expect(
            query(
                `INSERT INTO portal_requests
                    (author_id, title, description, frequency_count, frequency_period,
                     minutes_per_run, people_count)
                 VALUES ($1, 'З', 'О', 1, 'day', 1, 1)`,
                [randomUUID()],
            ),
        ).rejects.toThrow(/foreign key/);
        await expect(
            insertRequest({
                decision: 'accepted',
                skill_id: randomUUID(),
                decided_by: developerId,
                decided_at: new Date().toISOString(),
                reviewer_id: developerId,
                taken_at: new Date().toISOString(),
            }),
        ).rejects.toThrow(/foreign key/);
    });

    it('has no author-facing status column', async () => {
        const columns = (
            await query(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'portal_requests'`,
            )
        ).map((c) => c.column_name);
        expect(columns).not.toContain('status');
    });

    it('creates the author list index and the queue index', async () => {
        const defs = (
            await query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'portal_requests'`)
        ).map((r) => String(r.indexdef));
        expect(defs.some((d) => d.includes('(author_id, created_at DESC)'))).toBe(true);
        expect(defs.some((d) => d.includes('decision') && d.includes("'new'"))).toBe(true);
    });
});
