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

describe.skipIf(adminUrl === undefined)('036_portal_request_comments migration', () => {
    const dbName = `portal_cmt_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let userId: string;
    let requestId: string;
    const createdAt = new Date('2025-05-01T10:00:00.000Z');

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertComment = (
        body: string,
        extra: { requestId?: string; editedAt?: Date | null } = {},
    ): Promise<unknown> =>
        query(
            `INSERT INTO portal_request_comments (id, request_id, author_id, body, created_at, edited_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                randomUUID(),
                extra.requestId ?? requestId,
                userId,
                body,
                createdAt,
                extra.editedAt ?? null,
            ],
        );

    const insertRequest = async (): Promise<string> =>
        String(
            (
                await query(
                    `INSERT INTO portal_requests
                        (author_id, title, description, frequency_count, frequency_period, minutes_per_run, people_count, decision)
                     VALUES ($1, 'Т', 'О', 1, 'day', 1, 1, 'new') RETURNING id`,
                    [userId],
                )
            )[0]?.id,
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
        requestId = await insertRequest();
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('inserts a valid comment', async () => {
        await expect(insertComment('Привет')).resolves.toBeDefined();
        await expect(insertComment('x'.repeat(4000))).resolves.toBeDefined();
        await expect(
            insertComment('правка', { editedAt: new Date(createdAt.getTime() + 60_000) }),
        ).resolves.toBeDefined();
    });

    it('rejects empty body', async () => {
        await expect(insertComment('')).rejects.toThrow(/check constraint/);
    });

    it('rejects body longer than 4000 characters', async () => {
        await expect(insertComment('x'.repeat(4001))).rejects.toThrow(/check constraint/);
    });

    it('rejects edited_at earlier than created_at', async () => {
        await expect(
            insertComment('a', { editedAt: new Date(createdAt.getTime() - 1000) }),
        ).rejects.toThrow(/check constraint/);
    });

    it('rejects a comment on a missing request', async () => {
        await expect(insertComment('a', { requestId: randomUUID() })).rejects.toThrow(
            /foreign key constraint/,
        );
    });

    it('deletes comments together with the request', async () => {
        const otherId = await insertRequest();
        await insertComment('для удаления', { requestId: otherId });
        await query(`DELETE FROM portal_requests WHERE id = $1`, [otherId]);
        expect(
            await query(`SELECT 1 FROM portal_request_comments WHERE request_id = $1`, [otherId]),
        ).toHaveLength(0);
    });

    it('has the feed index', async () => {
        const [row] = await query(
            `SELECT indexdef FROM pg_indexes WHERE indexname = 'portal_request_comments_request_idx'`,
        );
        expect(String(row.indexdef)).toMatch(/\(request_id, created_at, id\)/);
    });
});
