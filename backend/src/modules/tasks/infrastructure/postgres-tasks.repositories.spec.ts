import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TaskNotFoundError } from '../domain/errors';
import { FileName } from '../domain/file-name';
import type { TaskPage } from '../domain/ports/task-repository.port';
import { Task } from '../domain/task';
import { TaskAttachment } from '../domain/task-attachment';
import { TaskFilter, type TaskFilterInput } from '../domain/task-filter';
import { TaskSort, type TaskSortInput } from '../domain/task-sort';
import { TaskStatus } from '../domain/task-status';
import { TaskTitle } from '../domain/task-title';
import { SlonikTaskAttachmentRepository } from './slonik-task-attachment.repository';
import { SlonikTaskRepository } from './slonik-task.repository';
import { SlonikUserDirectory } from './slonik-user-directory';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');

describe.skipIf(adminUrl === undefined)('Slonik tasks repositories', () => {
    const dbName = `tasks_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let tasks: SlonikTaskRepository;
    let attachments: SlonikTaskAttachmentRepository;
    let directory: SlonikUserDirectory;
    let alice: string;
    let bob: string;
    let carol: string;
    let inactive: string;

    async function addUser(login: string, isActive = true): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, $4)',
            [id, login, '$argon2id$fake', isActive],
        );
        return id;
    }

    let seq = 0;
    function makeTask(
        overrides: {
            title?: string;
            description?: string;
            deadline?: Date | null;
            creatorId?: string;
            assigneeId?: string | null;
            watcherIds?: string[];
            createdAt?: Date;
        } = {},
    ): Task {
        seq += 1;
        return Task.create({
            id: randomUUID(),
            title: TaskTitle.of(overrides.title ?? `Task ${String(seq)}`),
            description: overrides.description,
            deadline: overrides.deadline,
            creatorId: overrides.creatorId ?? alice,
            assigneeId: overrides.assigneeId,
            watcherIds: overrides.watcherIds,
            now: overrides.createdAt ?? new Date(T0.getTime() + seq * 1000),
        });
    }

    async function list(
        filter: TaskFilterInput = {},
        sort: TaskSortInput = {},
        page = { limit: 50, page: 0 },
    ): Promise<TaskPage> {
        return tasks.list(TaskFilter.of(filter), TaskSort.of(sort), page);
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
        tasks = new SlonikTaskRepository(pool);
        attachments = new SlonikTaskAttachmentRepository(pool);
        directory = new SlonikUserDirectory(pool);
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
        await client.query('DELETE FROM task');
        await client.query('DELETE FROM auth_users');
        alice = await addUser('alice');
        bob = await addUser('bob');
        carol = await addUser('carol');
        inactive = await addUser('gone', false);
    });

    describe('SlonikTaskRepository', () => {
        it('save + findById round-trip with watchers', async () => {
            const deadline = new Date(T0.getTime() + 5 * DAY);
            const task = makeTask({
                title: 'Write report',
                description: 'Quarterly',
                deadline,
                assigneeId: bob,
                watcherIds: [bob, carol],
            });
            await tasks.save(task);

            const found = await tasks.findById(task.id);
            expect(found).not.toBeNull();
            expect(found?.title.value).toBe('Write report');
            expect(found?.description).toBe('Quarterly');
            expect(found?.status).toBe('todo');
            expect(found?.deadline?.getTime()).toBe(deadline.getTime());
            expect(found?.creatorId).toBe(alice);
            expect(found?.assigneeId).toBe(bob);
            expect([...(found?.watcherIds ?? [])].sort()).toEqual([bob, carol].sort());
            expect(found?.createdAt.getTime()).toBe(task.createdAt.getTime());
            expect(found?.completedAt).toBeNull();
            expect(found?.deletedAt).toBeNull();
        });

        it('findById returns null for an unknown id', async () => {
            expect(await tasks.findById(randomUUID())).toBeNull();
        });

        it('save updates fields and replaces the watcher set', async () => {
            const task = makeTask({ watcherIds: [bob, carol] });
            await tasks.save(task);

            const loaded = await tasks.findById(task.id);
            loaded?.rename(TaskTitle.of('Renamed'));
            loaded?.assign(carol);
            loaded?.changeStatus(TaskStatus.parse('done'), T0);
            loaded?.replaceWatchers([alice]);
            if (loaded) await tasks.save(loaded);

            const found = await tasks.findById(task.id);
            expect(found?.title.value).toBe('Renamed');
            expect(found?.assigneeId).toBe(carol);
            expect(found?.status).toBe('done');
            expect(found?.completedAt?.getTime()).toBe(T0.getTime());
            expect(found?.watcherIds).toEqual([alice]);
            const { rows } = await client.query<{ n: number }>(
                'SELECT count(*)::int AS n FROM task_watcher WHERE task_id = $1',
                [task.id],
            );
            expect(rows[0]?.n).toBe(1);
        });

        it('save with an empty watcher set removes all watchers', async () => {
            const task = makeTask({ watcherIds: [bob] });
            await tasks.save(task);
            const loaded = await tasks.findById(task.id);
            loaded?.replaceWatchers([]);
            if (loaded) await tasks.save(loaded);
            expect((await tasks.findById(task.id))?.watcherIds).toEqual([]);
        });

        it('save never resurrects a task that was soft-deleted by someone else', async () => {
            const task = makeTask();
            await tasks.save(task);
            const stale = await tasks.findById(task.id);
            const deleter = await tasks.findById(task.id);
            deleter?.softDelete(T0);
            if (deleter) await tasks.save(deleter);

            stale?.rename(TaskTitle.of('Late edit'));
            await expect(stale ? tasks.save(stale) : Promise.resolve()).rejects.toBeInstanceOf(
                TaskNotFoundError,
            );

            expect(await tasks.findById(task.id)).toBeNull();
            const { rows } = await client.query<{ deleted_at: Date | null; title: string }>(
                'SELECT deleted_at, title FROM task WHERE id = $1',
                [task.id],
            );
            expect(rows[0]?.deleted_at).not.toBeNull();
            expect(rows[0]?.title).toBe(task.title.value);
        });

        it('concurrent saves keep a consistent watcher set', async () => {
            const task = makeTask({ watcherIds: [bob] });
            await tasks.save(task);
            const one = await tasks.findById(task.id);
            const two = await tasks.findById(task.id);
            one?.replaceWatchers([bob, carol]);
            two?.replaceWatchers([carol]);

            await Promise.all([one, two].map((t) => (t ? tasks.save(t) : Promise.resolve())));

            const { rows } = await client.query<{ n: number }>(
                'SELECT count(*)::int AS n FROM task_watcher WHERE task_id = $1',
                [task.id],
            );
            const found = await tasks.findById(task.id);
            expect(rows[0]?.n).toBe(found?.watcherIds.length);
        });

        it('soft delete hides the task from findById and list but keeps the row', async () => {
            const task = makeTask();
            await tasks.save(task);
            const loaded = await tasks.findById(task.id);
            loaded?.softDelete(T0);
            if (loaded) await tasks.save(loaded);

            expect(await tasks.findById(task.id)).toBeNull();
            expect((await list()).total).toBe(0);
            const { rows } = await client.query<{ deleted_at: Date | null }>(
                'SELECT deleted_at FROM task WHERE id = $1',
                [task.id],
            );
            expect(rows).toHaveLength(1);
            expect(rows[0]?.deleted_at).not.toBeNull();
        });

        describe('list', () => {
            it('filters by status', async () => {
                const todo = makeTask();
                const done = makeTask();
                done.changeStatus(TaskStatus.parse('done'), T0);
                await tasks.save(todo);
                await tasks.save(done);

                const result = await list({ status: 'done' });
                expect(result.items.map((t) => t.id)).toEqual([done.id]);
                expect(result.total).toBe(1);
            });

            it('filters by creator and assignee', async () => {
                const a = makeTask({ creatorId: alice, assigneeId: bob });
                const b = makeTask({ creatorId: bob, assigneeId: carol });
                await tasks.save(a);
                await tasks.save(b);

                expect((await list({ creatorId: bob })).items.map((t) => t.id)).toEqual([b.id]);
                expect((await list({ assigneeId: bob })).items.map((t) => t.id)).toEqual([a.id]);
            });

            it('filters by watcher via EXISTS and does not duplicate rows', async () => {
                const a = makeTask({ watcherIds: [bob, carol] });
                const b = makeTask({ watcherIds: [carol] });
                const c = makeTask();
                await tasks.save(a);
                await tasks.save(b);
                await tasks.save(c);

                const result = await list({ watcherId: carol });
                expect(result.items.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
                expect(result.total).toBe(2);
                expect((await list({ watcherId: bob })).items.map((t) => t.id)).toEqual([a.id]);
            });

            it('overdue means deadline in the past and status not done', async () => {
                const now = Date.now();
                const late = makeTask({ deadline: new Date(now - DAY) });
                const lateDone = makeTask({ deadline: new Date(now - DAY) });
                lateDone.changeStatus(TaskStatus.parse('done'), new Date());
                const future = makeTask({ deadline: new Date(now + DAY) });
                const noDeadline = makeTask();
                for (const t of [late, lateDone, future, noDeadline]) await tasks.save(t);

                const result = await list({ overdue: true });
                expect(result.items.map((t) => t.id)).toEqual([late.id]);
                expect(result.total).toBe(1);
            });

            it('filters by title substring case-insensitively and treats wildcards literally', async () => {
                const a = makeTask({ title: 'Prepare Budget' });
                const b = makeTask({ title: 'Call client' });
                const c = makeTask({ title: '100% done' });
                for (const t of [a, b, c]) await tasks.save(t);

                expect((await list({ titleContains: 'budget' })).items.map((t) => t.id)).toEqual([
                    a.id,
                ]);
                expect((await list({ titleContains: '%' })).items.map((t) => t.id)).toEqual([c.id]);
                expect((await list({ titleContains: '_' })).total).toBe(0);
            });

            it('combines filters with AND', async () => {
                const match = makeTask({ assigneeId: bob, watcherIds: [carol], title: 'Match me' });
                const wrongAssignee = makeTask({ assigneeId: carol, watcherIds: [carol] });
                const wrongWatcher = makeTask({ assigneeId: bob });
                for (const t of [match, wrongAssignee, wrongWatcher]) await tasks.save(t);

                const result = await list({
                    assigneeId: bob,
                    watcherId: carol,
                    status: 'todo',
                    titleContains: 'match',
                });
                expect(result.items.map((t) => t.id)).toEqual([match.id]);
            });

            it('orders by createdAt descending by default', async () => {
                const first = makeTask();
                const second = makeTask();
                const third = makeTask();
                for (const t of [first, second, third]) await tasks.save(t);

                const result = await list();
                expect(result.items.map((t) => t.id)).toEqual([third.id, second.id, first.id]);
            });

            it('orders by deadline with NULL last in both directions', async () => {
                const early = makeTask({ deadline: new Date(T0.getTime() + DAY) });
                const late = makeTask({ deadline: new Date(T0.getTime() + 3 * DAY) });
                const none = makeTask();
                for (const t of [early, none, late]) await tasks.save(t);

                const asc = await list({}, { field: 'deadline', direction: 'asc' });
                expect(asc.items.map((t) => t.id)).toEqual([early.id, late.id, none.id]);
                const desc = await list({}, { field: 'deadline', direction: 'desc' });
                expect(desc.items.map((t) => t.id)).toEqual([late.id, early.id, none.id]);
            });

            it('orders by updatedAt', async () => {
                const a = makeTask();
                const b = makeTask();
                await tasks.save(a);
                await tasks.save(b);
                await client.query('UPDATE task SET updated_at = $2 WHERE id = $1', [
                    a.id,
                    new Date(T0.getTime() + 10 * DAY),
                ]);

                const result = await list({}, { field: 'updatedAt', direction: 'desc' });
                expect(result.items.map((t) => t.id)).toEqual([a.id, b.id]);
            });

            it('paginates and reports total across pages', async () => {
                const created = [makeTask(), makeTask(), makeTask(), makeTask(), makeTask()];
                for (const t of created) await tasks.save(t);
                const newestFirst = [...created].reverse().map((t) => t.id);

                const page0 = await list({}, {}, { limit: 2, page: 0 });
                const page1 = await list({}, {}, { limit: 2, page: 1 });
                const page2 = await list({}, {}, { limit: 2, page: 2 });
                expect(page0.items.map((t) => t.id)).toEqual(newestFirst.slice(0, 2));
                expect(page1.items.map((t) => t.id)).toEqual(newestFirst.slice(2, 4));
                expect(page2.items.map((t) => t.id)).toEqual(newestFirst.slice(4));
                expect([page0.total, page1.total, page2.total]).toEqual([5, 5, 5]);
            });

            it('returns tasks with their watchers', async () => {
                const task = makeTask({ watcherIds: [bob, carol] });
                await tasks.save(task);
                const result = await list();
                expect([...(result.items[0]?.watcherIds ?? [])].sort()).toEqual(
                    [bob, carol].sort(),
                );
            });
        });
    });

    describe('SlonikTaskAttachmentRepository', () => {
        function attachmentInput(
            taskId: string,
            name: string,
        ): Parameters<typeof TaskAttachment.create>[0] {
            return {
                id: randomUUID(),
                taskId,
                originalName: FileName.of(name),
                storageKey: randomUUID(),
                sizeBytes: 3_000_000_000,
                contentType: 'application/pdf',
                uploadedBy: alice,
                createdAt: T0,
            };
        }

        function makeAttachment(taskId: string, name = 'report.pdf'): TaskAttachment {
            return TaskAttachment.create(attachmentInput(taskId, name));
        }

        it('insert + findByTask round-trip', async () => {
            const task = makeTask();
            await tasks.save(task);
            const attachment = makeAttachment(task.id);
            await attachments.insert(attachment);

            const found = await attachments.findByTask(task.id, attachment.id);
            expect(found?.id).toBe(attachment.id);
            expect(found?.taskId).toBe(task.id);
            expect(found?.originalName.value).toBe('report.pdf');
            expect(found?.storageKey).toBe(attachment.storageKey);
            expect(found?.sizeBytes).toBe(3_000_000_000);
            expect(found?.contentType).toBe('application/pdf');
            expect(found?.uploadedBy).toBe(alice);
            expect(found?.createdAt.getTime()).toBe(T0.getTime());
        });

        it('findByTask does not return an attachment of another task', async () => {
            const one = makeTask();
            const two = makeTask();
            await tasks.save(one);
            await tasks.save(two);
            const attachment = makeAttachment(one.id);
            await attachments.insert(attachment);

            expect(await attachments.findByTask(two.id, attachment.id)).toBeNull();
        });

        it('countByTask counts only the given task', async () => {
            const one = makeTask();
            const two = makeTask();
            await tasks.save(one);
            await tasks.save(two);
            await attachments.insert(makeAttachment(one.id));
            await attachments.insert(makeAttachment(one.id, 'b.txt'));
            await attachments.insert(makeAttachment(two.id));

            expect(await attachments.countByTask(one.id)).toBe(2);
            expect(await attachments.countByTask(two.id)).toBe(1);
            expect(await attachments.countByTask(randomUUID())).toBe(0);
        });

        it('countByTasks returns counts per task in one call and omits tasks without attachments', async () => {
            const one = makeTask();
            const two = makeTask();
            const none = makeTask();
            await tasks.save(one);
            await tasks.save(two);
            await tasks.save(none);
            await attachments.insert(makeAttachment(one.id));
            await attachments.insert(makeAttachment(one.id, 'b.txt'));
            await attachments.insert(makeAttachment(two.id));

            const counts = await attachments.countByTasks([one.id, two.id, none.id]);

            expect(counts.get(one.id)).toBe(2);
            expect(counts.get(two.id)).toBe(1);
            expect(counts.get(none.id) ?? 0).toBe(0);
            expect(counts.size).toBe(2);
        });

        it('countByTasks ignores tasks outside the requested set and handles an empty set', async () => {
            const one = makeTask();
            const two = makeTask();
            await tasks.save(one);
            await tasks.save(two);
            await attachments.insert(makeAttachment(one.id));
            await attachments.insert(makeAttachment(two.id));

            expect([...(await attachments.countByTasks([one.id]))]).toEqual([[one.id, 1]]);
            expect((await attachments.countByTasks([])).size).toBe(0);
        });

        it('listByTask returns the attachments of the task ordered by creation', async () => {
            const one = makeTask();
            const two = makeTask();
            await tasks.save(one);
            await tasks.save(two);
            const later = TaskAttachment.create({
                ...attachmentInput(one.id, 'later.txt'),
                createdAt: new Date(T0.getTime() + 1000),
            });
            const earlier = makeAttachment(one.id, 'earlier.txt');
            await attachments.insert(later);
            await attachments.insert(earlier);
            await attachments.insert(makeAttachment(two.id));

            const found = await attachments.listByTask(one.id);

            expect(found.map((a) => a.originalName.value)).toEqual(['earlier.txt', 'later.txt']);
            expect(await attachments.listByTask(randomUUID())).toEqual([]);
        });

        describe('insertWithinLimit', () => {
            it('inserts while under the limit and refuses at the limit', async () => {
                const task = makeTask();
                await tasks.save(task);

                expect(await attachments.insertWithinLimit(makeAttachment(task.id), 2)).toBe(
                    'inserted',
                );
                expect(await attachments.insertWithinLimit(makeAttachment(task.id), 2)).toBe(
                    'inserted',
                );
                expect(await attachments.insertWithinLimit(makeAttachment(task.id), 2)).toBe(
                    'limit-reached',
                );
                expect(await attachments.countByTask(task.id)).toBe(2);
            });

            it('never exceeds the limit under concurrent uploads', async () => {
                const task = makeTask();
                await tasks.save(task);
                await attachments.insertWithinLimit(makeAttachment(task.id), 3);

                const results = await Promise.all(
                    Array.from({ length: 8 }, () =>
                        attachments.insertWithinLimit(makeAttachment(task.id), 3),
                    ),
                );

                expect(results.filter((r) => r === 'inserted')).toHaveLength(2);
                expect(await attachments.countByTask(task.id)).toBe(3);
            });

            it('reports task-missing for a soft-deleted or unknown task', async () => {
                const task = makeTask();
                await tasks.save(task);
                const loaded = await tasks.findById(task.id);
                loaded?.softDelete(T0);
                if (loaded) await tasks.save(loaded);

                expect(await attachments.insertWithinLimit(makeAttachment(task.id), 5)).toBe(
                    'task-missing',
                );
                expect(await attachments.insertWithinLimit(makeAttachment(randomUUID()), 5)).toBe(
                    'task-missing',
                );
                expect(await attachments.countByTask(task.id)).toBe(0);
            });
        });

        it('delete removes the attachment and reports whether it existed', async () => {
            const task = makeTask();
            await tasks.save(task);
            const attachment = makeAttachment(task.id);
            await attachments.insert(attachment);

            expect(await attachments.delete(attachment.id)).toBe(true);
            expect(await attachments.findByTask(task.id, attachment.id)).toBeNull();
            expect(await attachments.delete(attachment.id)).toBe(false);
        });
    });

    describe('SlonikUserDirectory', () => {
        it('findActiveByIds returns only existing active users', async () => {
            const result = await directory.findActiveByIds([alice, bob, inactive, randomUUID()]);
            expect(result.map((u) => u.login).sort()).toEqual(['alice', 'bob']);
            expect(result.find((u) => u.login === 'alice')?.id).toBe(alice);
        });

        it('findActiveByIds with no ids returns an empty list', async () => {
            expect(await directory.findActiveByIds([])).toEqual([]);
        });
    });
});
