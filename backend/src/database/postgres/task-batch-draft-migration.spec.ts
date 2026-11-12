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

interface DraftInput {
    threadId?: string;
    status?: string | null;
    items?: string;
    origin?: string | null;
    ownerId?: string;
}

describe.skipIf(adminUrl === undefined)('025_task_batch_draft migration', () => {
    const dbName = `task_draft_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let ownerId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertDraft = async (input: DraftInput = {}): Promise<string> => {
        const rows = await query(
            `INSERT INTO task_batch_draft (owner_id, thread_id, items, origin, status)
             VALUES ($1, $2, $3::jsonb, $4::jsonb, COALESCE($5, 'draft')) RETURNING id`,
            [
                input.ownerId ?? ownerId,
                input.threadId ?? randomUUID(),
                input.items ?? '[{"title":"Задача"}]',
                input.origin ?? null,
                input.status ?? null,
            ],
        );
        return String(rows[0]?.id);
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
        const [user] = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        ownerId = String(user.id);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates a draft with defaults', async () => {
        const id = await insertDraft({
            origin: '{"kind":"meeting","fileId":"f","recordingName":"a.mp3"}',
        });

        const [row] = await query(
            'SELECT status, items, origin, result, created_at FROM task_batch_draft WHERE id = $1',
            [id],
        );

        expect(row).toMatchObject({
            status: 'draft',
            items: [{ title: 'Задача' }],
            origin: { kind: 'meeting', fileId: 'f', recordingName: 'a.mp3' },
            result: null,
        });
        expect(row.created_at).toBeInstanceOf(Date);
    });

    it.each(['draft', 'superseded', 'consumed'])('accepts the %s status', async (status) => {
        await expect(insertDraft({ status })).resolves.toBeTypeOf('string');
    });

    it('rejects an unknown status', async () => {
        await expect(insertDraft({ status: 'created' })).rejects.toThrow(/check constraint/);
    });

    it('requires items to be a JSON array', async () => {
        await expect(insertDraft({ items: '{}' })).rejects.toThrow(/check constraint/);
    });

    it('keeps only one draft per thread', async () => {
        const threadId = randomUUID();
        await insertDraft({ threadId });

        await expect(insertDraft({ threadId })).rejects.toThrow(/duplicate key/);
    });

    it('keeps superseded and consumed drafts of a thread next to the current one', async () => {
        const threadId = randomUUID();
        await insertDraft({ threadId, status: 'superseded' });
        await insertDraft({ threadId, status: 'consumed' });

        await expect(insertDraft({ threadId })).resolves.toBeTypeOf('string');
    });

    it('consumes a draft only once', async () => {
        const id = await insertDraft();
        const consume = (): Promise<Record<string, unknown>[]> =>
            query(
                `UPDATE task_batch_draft SET status = 'consumed'
                 WHERE id = $1 AND status = 'draft' RETURNING items`,
                [id],
            );

        expect(await consume()).toHaveLength(1);
        expect(await consume()).toHaveLength(0);
    });

    it('references auth_users', async () => {
        await expect(insertDraft({ ownerId: randomUUID() })).rejects.toThrow(/foreign key/);
    });
});
