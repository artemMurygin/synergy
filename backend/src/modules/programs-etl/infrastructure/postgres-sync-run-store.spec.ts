import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import {
    InvalidRunTransitionError,
    type NewProgramsSyncRun,
} from '../application/models/programs-sync-run';
import { PostgresSyncRunStore } from './postgres-sync-run-store';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('PostgresSyncRunStore', () => {
    const dbName = `etl_run_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let store: PostgresSyncRunStore;
    const changedSources = [{ sourceId: 'book1:10', observedHash: 'h1' }];
    let tick = 0;
    const newRun = (
        over: Partial<{
            groupId: string;
            previousRunId: string;
            trigger: 'scheduled' | 'retry';
        }> = {},
    ): NewProgramsSyncRun => ({
        id: randomUUID(),
        groupId: over.groupId ?? 'g1',
        trigger: over.trigger ?? ('scheduled' as const),
        ...(over.previousRunId === undefined ? {} : { previousRunId: over.previousRunId }),
        changedSources,
        now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + ++tick * 1000),
    });

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
        store = new PostgresSyncRunStore(pool);
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
        await client.query('DELETE FROM programs_sync_run');
    });

    it('createQueued stores a queued run and returns the record', async () => {
        const input = newRun();
        const record = await store.createQueued(input);
        expect(record).toMatchObject({
            id: input.id,
            groupId: 'g1',
            trigger: 'scheduled',
            status: 'queued',
            changedSources,
            createdAt: input.now,
        });
        expect(await store.findById(input.id)).toEqual(record);
    });

    it('runs queued -> running -> succeeded with timestamps', async () => {
        const { id } = await store.createQueued(newRun());
        await store.markRunning(id);
        const running = await store.findById(id);
        expect(running?.status).toBe('running');
        expect(running?.startedAt).toBeInstanceOf(Date);
        await store.markSucceeded(id);
        const done = await store.findById(id);
        expect(done?.status).toBe('succeeded');
        expect(done?.finishedAt).toBeInstanceOf(Date);
        expect(done?.failure).toBeUndefined();
    });

    it('markRunning is idempotent for a running run', async () => {
        const { id } = await store.createQueued(newRun());
        await store.markRunning(id);
        const first = await store.findById(id);
        await store.markRunning(id);
        expect(await store.findById(id)).toEqual(first);
    });

    it('markFailed stores a brief failure and keeps changed sources', async () => {
        const { id } = await store.createQueued(newRun());
        await store.markRunning(id);
        await store.markFailed({
            runId: id,
            failure: { code: 'TIMEOUT', message: 'sheet read timed out', retryable: true },
        });
        const failed = await store.findById(id);
        expect(failed).toMatchObject({
            status: 'failed',
            changedSources,
            failure: { code: 'TIMEOUT', message: 'sheet read timed out', retryable: true },
        });
        expect(failed?.finishedAt).toBeInstanceOf(Date);
    });

    it('markFailed is allowed from queued', async () => {
        const { id } = await store.createQueued(newRun());
        await store.markFailed({
            runId: id,
            failure: { code: 'INVALID_WORKFLOW_DATA', message: 'x', retryable: false },
        });
        expect((await store.findById(id))?.status).toBe('failed');
    });

    it('rejects invalid transitions on a real database and leaves the row unchanged', async () => {
        const { id } = await store.createQueued(newRun());
        await expect(store.markSucceeded(id)).rejects.toBeInstanceOf(InvalidRunTransitionError);
        await store.markRunning(id);
        await store.markSucceeded(id);
        await expect(store.markRunning(id)).rejects.toBeInstanceOf(InvalidRunTransitionError);
        await expect(
            store.markFailed({
                runId: id,
                failure: { code: 'TIMEOUT', message: 'x', retryable: true },
            }),
        ).rejects.toBeInstanceOf(InvalidRunTransitionError);
        expect((await store.findById(id))?.status).toBe('succeeded');
    });

    it('rejects transitions of an unknown run', async () => {
        await expect(store.markRunning(randomUUID())).rejects.toBeInstanceOf(ProgramsSyncError);
        expect(await store.findById(randomUUID())).toBeNull();
    });

    it('links a retry run through previousRunId', async () => {
        const first = await store.createQueued(newRun());
        await store.markFailed({
            runId: first.id,
            failure: { code: 'TIMEOUT', message: 'x', retryable: true },
        });
        const retry = await store.createQueued(
            newRun({ trigger: 'retry', previousRunId: first.id }),
        );
        expect(retry).toMatchObject({ trigger: 'retry', previousRunId: first.id });
        expect((await store.findById(retry.id))?.previousRunId).toBe(first.id);
    });

    describe('list', () => {
        it('returns newest first with cursor pagination', async () => {
            const ids: string[] = [];
            for (let i = 0; i < 5; i++) ids.push((await store.createQueued(newRun())).id);
            const page1 = await store.list({ limit: 2 });
            expect(page1.items.map((r) => r.id)).toEqual([ids[4], ids[3]]);
            expect(page1.nextCursor).toBeDefined();
            const page2 = await store.list({ limit: 2, cursor: page1.nextCursor });
            expect(page2.items.map((r) => r.id)).toEqual([ids[2], ids[1]]);
            const page3 = await store.list({ limit: 2, cursor: page2.nextCursor });
            expect(page3.items.map((r) => r.id)).toEqual([ids[0]]);
            expect(page3.nextCursor).toBeUndefined();
        });

        it('filters by groupId and status', async () => {
            const a = await store.createQueued(newRun({ groupId: 'ga' }));
            const b = await store.createQueued(newRun({ groupId: 'gb' }));
            await store.markRunning(b.id);
            await store.markSucceeded(b.id);
            expect((await store.list({ limit: 10, groupId: 'ga' })).items.map((r) => r.id)).toEqual(
                [a.id],
            );
            expect(
                (await store.list({ limit: 10, status: 'succeeded' })).items.map((r) => r.id),
            ).toEqual([b.id]);
            expect(
                (await store.list({ limit: 10, groupId: 'ga', status: 'succeeded' })).items,
            ).toEqual([]);
        });

        it('returns summaries without changed sources or failure payload', async () => {
            const { id } = await store.createQueued(newRun());
            const [item] = (await store.list({ limit: 1 })).items;
            expect(item).toMatchObject({
                id,
                groupId: 'g1',
                status: 'queued',
                trigger: 'scheduled',
            });
            expect(item).not.toHaveProperty('changedSources');
        });

        it('rejects a malformed cursor', async () => {
            await expect(store.list({ limit: 1, cursor: 'garbage' })).rejects.toBeInstanceOf(
                ProgramsSyncError,
            );
        });
    });
});
