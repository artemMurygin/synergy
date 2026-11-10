import { beforeEach, describe, expect, it } from 'vitest';
import { Actor } from '../domain/actor';
import { FileName } from '../domain/file-name';
import { Task } from '../domain/task';
import { TaskAttachment } from '../domain/task-attachment';
import { TaskFilter } from '../domain/task-filter';
import { TaskSort } from '../domain/task-sort';
import { TaskTitle } from '../domain/task-title';
import { ListTasksUseCase } from './list-tasks.use-case';
import {
    FakeUserDirectory,
    InMemoryAttachmentRepository,
    InMemoryTaskRepository,
    NOW,
    fakeClock,
} from './test-doubles';

const me = Actor.of('me');
const day = (n: number): Date => new Date(Date.UTC(2026, 0, n));
const firstPage = { limit: 20, page: 0 };

let tasks: InMemoryTaskRepository;
let attachments: InMemoryAttachmentRepository;
let list: ListTasksUseCase;

interface SeedOptions {
    creatorId?: string;
    assigneeId?: string;
    watcherIds?: string[];
    deadline?: Date;
    status?: 'todo' | 'in_progress' | 'done';
    createdDay?: number;
}

const seed = async (id: string, title: string, options: SeedOptions = {}): Promise<Task> => {
    const task = Task.create({
        id,
        title: TaskTitle.of(title),
        creatorId: options.creatorId ?? 'anna',
        assigneeId: options.assigneeId,
        watcherIds: options.watcherIds,
        deadline: options.deadline,
        now: day(options.createdDay ?? 1),
    });
    if (options.status !== undefined) task.changeStatus(options.status, day(2));
    await tasks.save(task);
    return task;
};

const ids = (result: { items: { id: string }[] }): string[] => result.items.map((t) => t.id);

beforeEach(() => {
    tasks = new InMemoryTaskRepository(fakeClock);
    attachments = new InMemoryAttachmentRepository();
    list = new ListTasksUseCase(
        tasks,
        attachments,
        new FakeUserDirectory([
            { id: 'anna', login: 'anna' },
            { id: 'boris', login: 'boris' },
        ]),
    );
});

describe('ListTasksUseCase filters', () => {
    it('filters by status', async () => {
        await seed('a', 'A', { status: 'done' });
        await seed('b', 'B');

        const result = await list.execute(
            me,
            TaskFilter.of({ status: 'done' }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result)).toEqual(['a']);
    });

    it('filters by creator', async () => {
        await seed('a', 'A', { creatorId: 'anna' });
        await seed('b', 'B', { creatorId: 'boris' });

        const result = await list.execute(
            me,
            TaskFilter.of({ creatorId: 'boris' }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result)).toEqual(['b']);
    });

    it('filters by assignee', async () => {
        await seed('a', 'A', { assigneeId: 'me' });
        await seed('b', 'B', { assigneeId: 'boris' });
        await seed('c', 'C');

        const result = await list.execute(
            me,
            TaskFilter.of({ assigneeId: 'me' }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result)).toEqual(['a']);
    });

    it('filters by watcher', async () => {
        await seed('a', 'A', { watcherIds: ['me', 'boris'] });
        await seed('b', 'B', { watcherIds: ['boris'] });

        const result = await list.execute(
            me,
            TaskFilter.of({ watcherId: 'me' }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result)).toEqual(['a']);
    });

    it('returns only overdue tasks: past deadline and not done', async () => {
        const past = new Date(NOW.getTime() - 86_400_000);
        const future = new Date(NOW.getTime() + 86_400_000);
        await seed('late', 'Late', { deadline: past });
        await seed('late-wip', 'Late wip', { deadline: past, status: 'in_progress' });
        await seed('late-done', 'Late done', { deadline: past, status: 'done' });
        await seed('future', 'Future', { deadline: future });
        await seed('open', 'No deadline');

        const result = await list.execute(
            me,
            TaskFilter.of({ overdue: true }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result).sort()).toEqual(['late', 'late-wip']);
    });

    it('filters by a title substring, ignoring case', async () => {
        await seed('a', 'Квартальный ОТЧЁТ');
        await seed('b', 'Звонок клиенту');

        const result = await list.execute(
            me,
            TaskFilter.of({ titleContains: 'отчёт' }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result)).toEqual(['a']);
    });

    it('combines filters with AND', async () => {
        await seed('a', 'Отчёт', { assigneeId: 'me', status: 'done' });
        await seed('b', 'Отчёт', { assigneeId: 'me' });
        await seed('c', 'Отчёт', { assigneeId: 'boris', status: 'done' });

        const result = await list.execute(
            me,
            TaskFilter.of({ assigneeId: 'me', status: 'done', titleContains: 'отчёт' }),
            TaskSort.default(),
            firstPage,
        );

        expect(ids(result)).toEqual(['a']);
    });

    it('does not return deleted tasks', async () => {
        const deleted = await seed('a', 'A');
        deleted.softDelete(NOW);
        await seed('b', 'B');

        const result = await list.execute(me, TaskFilter.of({}), TaskSort.default(), firstPage);

        expect(ids(result)).toEqual(['b']);
        expect(result.total).toBe(1);
    });
});

describe('ListTasksUseCase sorting and paging', () => {
    it('sorts newest first by default', async () => {
        await seed('old', 'Old', { createdDay: 1 });
        await seed('new', 'New', { createdDay: 3 });
        await seed('mid', 'Mid', { createdDay: 2 });

        const result = await list.execute(me, TaskFilter.of({}), TaskSort.default(), firstPage);

        expect(ids(result)).toEqual(['new', 'mid', 'old']);
    });

    it('sorts by deadline with tasks without deadline last', async () => {
        await seed('none', 'None');
        await seed('late', 'Late', { deadline: day(9) });
        await seed('soon', 'Soon', { deadline: day(5) });

        const asc = await list.execute(
            me,
            TaskFilter.of({}),
            TaskSort.of({ field: 'deadline', direction: 'asc' }),
            firstPage,
        );
        const desc = await list.execute(
            me,
            TaskFilter.of({}),
            TaskSort.of({ field: 'deadline', direction: 'desc' }),
            firstPage,
        );

        expect(ids(asc)).toEqual(['soon', 'late', 'none']);
        expect(ids(desc)).toEqual(['late', 'soon', 'none']);
    });

    it('returns the requested page and the total across pages', async () => {
        for (let i = 1; i <= 5; i += 1)
            await seed(`t${String(i)}`, `Task ${String(i)}`, { createdDay: i });

        const second = await list.execute(me, TaskFilter.of({}), TaskSort.default(), {
            limit: 2,
            page: 1,
        });

        expect(ids(second)).toEqual(['t3', 't2']);
        expect(second.total).toBe(5);
        expect(second.limit).toBe(2);
        expect(second.page).toBe(1);
    });

    it('counts the total of filtered tasks only', async () => {
        await seed('a', 'A', { status: 'done' });
        await seed('b', 'B', { status: 'done' });
        await seed('c', 'C');

        const result = await list.execute(
            me,
            TaskFilter.of({ status: 'done' }),
            TaskSort.default(),
            { limit: 1, page: 0 },
        );

        expect(result.items).toHaveLength(1);
        expect(result.total).toBe(2);
    });

    it('returns an empty page past the end', async () => {
        await seed('a', 'A');

        const result = await list.execute(me, TaskFilter.of({}), TaskSort.default(), {
            limit: 10,
            page: 3,
        });

        expect(result.items).toEqual([]);
        expect(result.total).toBe(1);
    });

    it('resolves participants in items', async () => {
        await seed('a', 'A', { assigneeId: 'boris', watcherIds: ['anna'] });

        const result = await list.execute(me, TaskFilter.of({}), TaskSort.default(), firstPage);

        expect(result.items[0]).toMatchObject({
            creator: { id: 'anna', login: 'anna' },
            assignee: { id: 'boris', login: 'boris' },
            watchers: [{ id: 'anna', login: 'anna' }],
        });
    });
});

describe('ListTasksUseCase attachmentCount', () => {
    const attach = async (id: string, taskId: string): Promise<void> => {
        await attachments.insert(
            TaskAttachment.create({
                id,
                taskId,
                originalName: FileName.of(`${id}.pdf`),
                storageKey: `key-${id}`,
                sizeBytes: 7,
                contentType: 'application/pdf',
                uploadedBy: 'anna',
                createdAt: day(2),
            }),
        );
    };

    it('reports the number of attachments per task and 0 for tasks without any', async () => {
        await seed('a', 'A', { createdDay: 3 });
        await seed('b', 'B', { createdDay: 2 });
        await seed('c', 'C', { createdDay: 1 });
        await attach('f1', 'a');
        await attach('f2', 'a');
        await attach('f3', 'b');

        const result = await list.execute(me, TaskFilter.of({}), TaskSort.default(), firstPage);

        expect(result.items.map((t) => [t.id, t.attachmentCount])).toEqual([
            ['a', 2],
            ['b', 1],
            ['c', 0],
        ]);
    });

    it('counts all tasks of the page with a single query', async () => {
        await seed('a', 'A');
        await seed('b', 'B');
        await seed('c', 'C');

        await list.execute(me, TaskFilter.of({}), TaskSort.default(), firstPage);

        expect(attachments.countByTasks).toHaveBeenCalledTimes(1);
        expect(attachments.countByTask).not.toHaveBeenCalled();
    });

    it('reflects a deleted attachment', async () => {
        await seed('a', 'A');
        await attach('f1', 'a');
        await attach('f2', 'a');
        await attachments.delete('f1');

        const result = await list.execute(me, TaskFilter.of({}), TaskSort.default(), firstPage);

        expect(result.items[0]?.attachmentCount).toBe(1);
    });
});
