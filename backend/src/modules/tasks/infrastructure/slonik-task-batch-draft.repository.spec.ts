import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { DraftOrigin } from '../domain/draft-origin';
import { DraftTaskItem } from '../domain/draft-task-item';
import { TaskBatchDraft } from '../domain/task-batch-draft';
import { TaskBatchResult } from '../domain/task-batch-result';
import { SlonikTaskBatchDraftRepository } from './slonik-task-batch-draft.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-03-01T10:00:00.000Z');

describe.skipIf(adminUrl === undefined)('SlonikTaskBatchDraftRepository', () => {
    const dbName = `task_drafts_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: SlonikTaskBatchDraftRepository;
    let owner: string;
    let other: string;
    const thread = randomUUID();

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    function draftOf(
        overrides: { threadId?: string; ownerId?: string; origin?: DraftOrigin | null } = {},
    ): TaskBatchDraft {
        return TaskBatchDraft.create({
            id: randomUUID(),
            ownerId: overrides.ownerId ?? owner,
            threadId: overrides.threadId ?? thread,
            items: [
                DraftTaskItem.of({
                    title: 'Подготовить КП',
                    description: 'Для клиента',
                    deadline: new Date('2026-03-05T20:59:00.000Z'),
                    assigneeId: other,
                    creatorId: owner,
                    watcherIds: [other],
                    sourceNote: '[00:01:02] Анна',
                }),
                DraftTaskItem.of({ title: 'Созвон', creatorId: other }),
            ],
            origin: overrides.origin ?? null,
            now: T0,
        });
    }

    async function statusOf(id: string): Promise<string | undefined> {
        const result = await client.query<{ status: string }>(
            'SELECT status FROM task_batch_draft WHERE id = $1',
            [id],
        );
        return result.rows[0]?.status;
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        pool = await createPool(dbUrl);
        transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        repository = new SlonikTaskBatchDraftRepository(transactions);
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM task_batch_draft');
        await client.query('DELETE FROM auth_users');
        owner = await addUser('owner');
        other = await addUser('other');
    });

    it('saves a draft and restores its items and origin', async () => {
        const origin = DraftOrigin.meeting({ fileId: randomUUID(), recordingName: 'rec.m4a' });
        const draft = draftOf({ origin });
        await repository.save(draft);

        const found = await repository.findById(draft.id, owner);

        expect(found?.status).toBe('draft');
        expect(found?.origin).toEqual(origin);
        expect(found?.createdAt).toEqual(T0);
        expect(found?.items).toEqual(draft.items);
        expect(found?.items[0].title.value).toBe('Подготовить КП');
        expect(found?.items[0].deadline).toEqual(new Date('2026-03-05T20:59:00.000Z'));
        expect(found?.result).toBeNull();
    });

    it('does not find a draft of another owner', async () => {
        const draft = draftOf();
        await repository.save(draft);

        expect(await repository.findById(draft.id, other)).toBeNull();
        expect(await repository.findById(randomUUID(), owner)).toBeNull();
    });

    it('supersedes the active draft of the thread only', async () => {
        const first = draftOf();
        const elsewhere = draftOf({ threadId: randomUUID() });
        await repository.save(first);
        await repository.save(elsewhere);

        await repository.supersedeActive(thread, owner);

        expect(await statusOf(first.id)).toBe('superseded');
        expect(await statusOf(elsewhere.id)).toBe('draft');
        await repository.save(draftOf());
    });

    it('consumes a draft once', async () => {
        const draft = draftOf();
        await repository.save(draft);

        expect(await repository.consume(draft.id, other)).toBe(false);
        expect(await repository.consume(draft.id, owner)).toBe(true);
        expect(await repository.consume(draft.id, owner)).toBe(false);
        expect(await statusOf(draft.id)).toBe('consumed');
    });

    it('does not consume a superseded draft', async () => {
        const draft = draftOf();
        await repository.save(draft);
        await repository.supersedeActive(thread, owner);

        expect(await repository.consume(draft.id, owner)).toBe(false);
    });

    it('lets exactly one of two parallel consumes win', async () => {
        const draft = draftOf();
        await repository.save(draft);

        const outcomes = await Promise.all([
            repository.consume(draft.id, owner),
            repository.consume(draft.id, owner),
        ]);

        expect(outcomes.filter(Boolean)).toHaveLength(1);
    });

    it('stores the result of the batch', async () => {
        const draft = draftOf();
        await repository.save(draft);
        await repository.consume(draft.id, owner);
        const result = TaskBatchResult.of([
            { index: 1, status: 'created', taskId: randomUUID() },
            { index: 2, status: 'failed', reason: 'исполнитель отключён' },
        ]);

        await repository.saveResult(draft.id, result);

        const found = await repository.findById(draft.id, owner);
        expect(found?.status).toBe('consumed');
        expect(found?.result?.items).toEqual(result.items);
    });
});
