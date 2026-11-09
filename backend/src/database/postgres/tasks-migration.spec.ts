import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('014_tasks migration', () => {
    const dbName = `tasks_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let counter = 0;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createUser = async (): Promise<string> => {
        counter += 1;
        const rows = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
            [`user${String(counter)}`],
        );
        return String(rows[0]?.id);
    };

    const createTask = async (
        creatorId: string,
        extra: {
            title?: string;
            status?: string;
            assigneeId?: string | null;
            completedAt?: Date | null;
            description?: string;
        } = {},
    ): Promise<string> => {
        const rows = await query(
            `INSERT INTO task (title, status, creator_id, assignee_id, completed_at, description)
             VALUES ($1, COALESCE($2, 'todo'), $3, $4, $5, $6) RETURNING id`,
            [
                extra.title ?? 'Task',
                extra.status ?? null,
                creatorId,
                extra.assigneeId ?? null,
                extra.completedAt ?? null,
                extra.description ?? '',
            ],
        );
        return String(rows[0]?.id);
    };

    const createAttachment = async (
        taskId: string,
        uploadedBy: string,
        storageKey: string,
    ): Promise<string> => {
        const rows = await query(
            `INSERT INTO task_attachment
                 (task_id, original_name, storage_key, size_bytes, content_type, uploaded_by)
             VALUES ($1, 'a.txt', $2, 10, 'text/plain', $3) RETURNING id`,
            [taskId, storageKey, uploadedBy],
        );
        return String(rows[0]?.id);
    };

    const indexDefs = async (table: string): Promise<string[]> =>
        (await query(`SELECT indexdef FROM pg_indexes WHERE tablename = $1`, [table])).map((r) =>
            String(r.indexdef),
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
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates the three task tables', async () => {
        const rows = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'task%'`,
        );
        expect(rows.map((r) => r.table_name).sort()).toEqual([
            'task',
            'task_attachment',
            'task_watcher',
        ]);
    });

    it('applies defaults to a task', async () => {
        const id = await createTask(await createUser());
        const [row] = await query(
            `SELECT description, status, deadline, assignee_id, completed_at, deleted_at,
                    created_at, updated_at
             FROM task WHERE id = $1`,
            [id],
        );
        expect(row.description).toBe('');
        expect(row.status).toBe('todo');
        expect(row.deadline).toBeNull();
        expect(row.assignee_id).toBeNull();
        expect(row.completed_at).toBeNull();
        expect(row.deleted_at).toBeNull();
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
    });

    it('accepts the three statuses and rejects an unknown one', async () => {
        const userId = await createUser();
        for (const status of ['todo', 'in_progress', 'done']) {
            await expect(
                createTask(userId, { status, completedAt: status === 'done' ? new Date() : null }),
            ).resolves.toBeTypeOf('string');
        }
        await expect(createTask(userId, { status: 'blocked' })).rejects.toThrow();
    });

    it('requires completed_at exactly when the status is done', async () => {
        const userId = await createUser();
        await expect(createTask(userId, { status: 'done' })).rejects.toThrow();
        await expect(
            createTask(userId, { status: 'todo', completedAt: new Date() }),
        ).rejects.toThrow();
    });

    it('limits the description to 10000 characters', async () => {
        const userId = await createUser();
        await expect(createTask(userId, { description: 'x'.repeat(10_000) })).resolves.toBeTypeOf(
            'string',
        );
        await expect(createTask(userId, { description: 'x'.repeat(10_001) })).rejects.toThrow();
    });

    it('limits the title length to 1..200 characters', async () => {
        const userId = await createUser();
        await expect(createTask(userId, { title: 'x'.repeat(200) })).resolves.toBeTypeOf('string');
        await expect(createTask(userId, { title: '' })).rejects.toThrow();
        await expect(createTask(userId, { title: 'x'.repeat(201) })).rejects.toThrow();
    });

    it('requires an existing creator and assignee', async () => {
        await expect(createTask(randomUUID())).rejects.toThrow();
        await expect(
            createTask(await createUser(), { assigneeId: randomUUID() }),
        ).rejects.toThrow();
    });

    it('sets assignee to NULL when the assignee user is deleted', async () => {
        const creator = await createUser();
        const assignee = await createUser();
        const taskId = await createTask(creator, { assigneeId: assignee });
        await query('DELETE FROM auth_users WHERE id = $1', [assignee]);
        const [row] = await query('SELECT assignee_id FROM task WHERE id = $1', [taskId]);
        expect(row.assignee_id).toBeNull();
    });

    it('forbids deleting a user who created a task', async () => {
        const creator = await createUser();
        await createTask(creator);
        await expect(query('DELETE FROM auth_users WHERE id = $1', [creator])).rejects.toThrow();
    });

    it('uses a composite primary key for watchers', async () => {
        const userId = await createUser();
        const taskId = await createTask(userId);
        await query('INSERT INTO task_watcher (task_id, user_id) VALUES ($1, $2)', [
            taskId,
            userId,
        ]);
        await expect(
            query('INSERT INTO task_watcher (task_id, user_id) VALUES ($1, $2)', [taskId, userId]),
        ).rejects.toThrow();
        const rows = await query(
            `SELECT a.attname FROM pg_index i
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
             WHERE i.indrelid = 'task_watcher'::regclass AND i.indisprimary`,
        );
        expect(rows.map((r) => r.attname).sort()).toEqual(['task_id', 'user_id']);
    });

    it('cascades task and user deletion to watchers', async () => {
        const creator = await createUser();
        const watcher = await createUser();
        const taskA = await createTask(creator);
        const taskB = await createTask(creator);
        await query('INSERT INTO task_watcher (task_id, user_id) VALUES ($1, $2), ($3, $2)', [
            taskA,
            watcher,
            taskB,
        ]);
        await query('DELETE FROM task WHERE id = $1', [taskA]);
        expect(await query('SELECT 1 FROM task_watcher WHERE task_id = $1', [taskA])).toHaveLength(
            0,
        );
        await query('DELETE FROM auth_users WHERE id = $1', [watcher]);
        expect(await query('SELECT 1 FROM task_watcher WHERE task_id = $1', [taskB])).toHaveLength(
            0,
        );
    });

    it('rejects watchers of an unknown task or user', async () => {
        const userId = await createUser();
        const taskId = await createTask(userId);
        await expect(
            query('INSERT INTO task_watcher (task_id, user_id) VALUES ($1, $2)', [
                randomUUID(),
                userId,
            ]),
        ).rejects.toThrow();
        await expect(
            query('INSERT INTO task_watcher (task_id, user_id) VALUES ($1, $2)', [
                taskId,
                randomUUID(),
            ]),
        ).rejects.toThrow();
    });

    it('stores attachments with a unique storage_key', async () => {
        const userId = await createUser();
        const taskId = await createTask(userId);
        const id = await createAttachment(taskId, userId, 'key-unique');
        const [row] = await query(
            'SELECT size_bytes, created_at FROM task_attachment WHERE id = $1',
            [id],
        );
        expect(Number(row.size_bytes)).toBe(10);
        expect(row.created_at).toBeInstanceOf(Date);
        await expect(createAttachment(taskId, userId, 'key-unique')).rejects.toThrow();
    });

    it('cascades task deletion to attachments', async () => {
        const userId = await createUser();
        const taskId = await createTask(userId);
        const id = await createAttachment(taskId, userId, 'key-cascade');
        await query('DELETE FROM task WHERE id = $1', [taskId]);
        expect(await query('SELECT 1 FROM task_attachment WHERE id = $1', [id])).toHaveLength(0);
    });

    it('rejects attachments of an unknown task or uploader', async () => {
        const userId = await createUser();
        const taskId = await createTask(userId);
        await expect(createAttachment(randomUUID(), userId, 'key-no-task')).rejects.toThrow();
        await expect(createAttachment(taskId, randomUUID(), 'key-no-user')).rejects.toThrow();
    });

    it('creates partial indexes on task for live rows', async () => {
        const defs = await indexDefs('task');
        for (const column of ['status', 'assignee_id', 'creator_id', 'deadline', 'created_at']) {
            expect(
                defs.some((d) => d.includes(column) && d.includes('WHERE (deleted_at IS NULL)')),
                column,
            ).toBe(true);
        }
        expect(defs.some((d) => d.includes('created_at DESC'))).toBe(true);
    });

    it('creates an index on task_watcher(user_id)', async () => {
        const defs = await indexDefs('task_watcher');
        expect(defs.some((d) => d.includes('(user_id)'))).toBe(true);
    });
});
