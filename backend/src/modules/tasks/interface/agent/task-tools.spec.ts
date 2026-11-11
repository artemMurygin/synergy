import { toJSONSchema } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunContext } from '../../../../shared/agent-capability';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { CreateTaskUseCase } from '../../application/create-task.use-case';
import { ListTasksUseCase } from '../../application/list-tasks.use-case';
import {
    FakeAccessPolicy,
    FakeUserDirectory,
    InMemoryAttachmentRepository,
    InMemoryTaskRepository,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
    fakeClock,
} from '../../application/test-doubles';
import { UpdateTaskUseCase } from '../../application/update-task.use-case';
import { createTaskTools, type TaskTools } from './task-tools';

const users = [
    { id: 'me', login: 'me' },
    { id: 'petr-1', login: 'petr.ivanov' },
    { id: 'petr-2', login: 'petr.sidorov' },
    { id: 'anna', login: 'anna' },
];

let tasks: InMemoryTaskRepository;
let directory: FakeUserDirectory;
let policy: FakeAccessPolicy;
let tools: TaskTools;

function build(userId = 'me'): TaskTools {
    const transactions = new SnapshotTransactionRunner([tasks]);
    const events = new RecordingEventPublisher(transactions);
    const attachments = new InMemoryAttachmentRepository();
    return createTaskTools(
        {
            createTask: new CreateTaskUseCase(tasks, directory, fakeClock, transactions, events),
            listTasks: new ListTasksUseCase(tasks, attachments, directory),
            updateTask: new UpdateTaskUseCase(tasks, attachments, directory, policy, fakeClock),
            users: directory,
        },
        AgentRunContext.create({ userId, threadId: 'thread-1' }),
    );
}

async function call(
    tool: { invoke(input: never): Promise<unknown> },
    input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const raw = await tool.invoke(input as never);
    return JSON.parse(raw as string) as Record<string, unknown>;
}

beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    directory = new FakeUserDirectory(users);
    policy = new FakeAccessPolicy();
    tools = build();
});

describe('tool contracts', () => {
    it('exposes exactly the four tools by name', () => {
        expect(Object.values(tools).map((tool) => tool.name)).toEqual([
            'create_task',
            'search_tasks',
            'find_users',
            'update_task',
        ]);
    });

    it('never offers the model a user or creator parameter', () => {
        for (const tool of Object.values(tools)) {
            const schema = toJSONSchema(tool.schema as never) as {
                properties?: Record<string, unknown>;
            };
            const keys = Object.keys(schema.properties ?? {}).map((key) => key.toLowerCase());
            expect(keys).not.toContain('userid');
            expect(keys).not.toContain('creatorid');
            expect(keys).not.toContain('actor');
            expect(keys).not.toContain('user');
        }
    });
});

describe('create_task', () => {
    it('creates the task on behalf of the run user and reports title and assignee', async () => {
        const result = await call(tools.createTask, {
            title: 'Подготовить отчёт',
            assigneeId: 'anna',
            deadline: '2026-02-01T09:00:00Z',
        });

        expect(result).toMatchObject({
            created: true,
            task: { title: 'Подготовить отчёт', assignee: 'anna', creator: 'me' },
        });
        const [saved] = [...tasks.byId.values()];
        expect(saved.creatorId).toBe('me');
        expect(saved.assigneeId).toBe('anna');
        expect(saved.deadline).toEqual(new Date('2026-02-01T09:00:00Z'));
    });

    it('ignores any attempt to pass another creator in the arguments', async () => {
        await call(tools.createTask, {
            title: 'От имени Петра',
            creatorId: 'petr-1',
            userId: 'petr-1',
        });

        expect([...tasks.byId.values()][0].creatorId).toBe('me');
    });

    it('takes the user from the run context of each built toolset', async () => {
        await call(build('anna').createTask, { title: 'Задача Анны' });

        expect([...tasks.byId.values()][0].creatorId).toBe('anna');
    });

    it('does not invent fields: omitted fields stay empty', async () => {
        await call(tools.createTask, { title: 'Только заголовок' });

        const [saved] = [...tasks.byId.values()];
        expect(saved.assigneeId).toBeNull();
        expect(saved.deadline).toBeNull();
        expect(saved.description).toBe('');
        expect(saved.watcherIds).toEqual([]);
    });

    it('explains a rejected deadline and creates nothing', async () => {
        const result = await call(tools.createTask, { title: 'Срок', deadline: 'завтра' });

        expect(result.created).toBe(false);
        expect(String(result.error)).toContain('срок');
        expect(tasks.byId.size).toBe(0);
    });

    it('explains an unknown assignee in plain text', async () => {
        const result = await call(tools.createTask, { title: 'X', assigneeId: 'nobody' });

        expect(result.created).toBe(false);
        expect(String(result.error)).toMatch(/пользовател/i);
        expect(tasks.byId.size).toBe(0);
    });

    it('explains an invalid title', async () => {
        const result = await call(tools.createTask, { title: '   ' });

        expect(result.created).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(tasks.byId.size).toBe(0);
    });
});

describe('search_tasks', () => {
    beforeEach(async () => {
        await call(tools.createTask, { title: 'Отчёт для Пети', assigneeId: 'petr-1' });
        await call(tools.createTask, { title: 'Закупка', assigneeId: 'me' });
        await call(build('anna').createTask, { title: 'Задача Анны', assigneeId: 'anna' });
    });

    it('finds by a title fragment and returns the task id for update_task', async () => {
        const result = await call(tools.searchTasks, { query: 'отчёт' });

        expect(result.total).toBe(1);
        const [task] = result.tasks as Record<string, unknown>[];
        expect(task).toMatchObject({
            title: 'Отчёт для Пети',
            status: 'todo',
            assignee: 'petr.ivanov',
        });
        expect(typeof task.id).toBe('string');
    });

    it('lists the tasks assigned to the run user for assignedToMe', async () => {
        const result = await call(tools.searchTasks, { assignedToMe: true });

        expect((result.tasks as { title: string }[]).map((t) => t.title)).toEqual(['Закупка']);
    });

    it('lists the tasks created by the run user for createdByMe', async () => {
        const result = await call(tools.searchTasks, { createdByMe: true });

        expect(result.total).toBe(2);
    });

    it('filters by status', async () => {
        const [{ id }] = (await call(tools.searchTasks, { query: 'Закупка' })).tasks as {
            id: string;
        }[];
        await call(tools.updateTask, { taskId: id, status: 'done' });

        const done = await call(tools.searchTasks, { status: 'done' });
        expect((done.tasks as { id: string }[]).map((t) => t.id)).toEqual([id]);
    });

    it('says that nothing was found', async () => {
        const result = await call(tools.searchTasks, { query: 'несуществующая' });

        expect(result.total).toBe(0);
        expect(result.tasks).toEqual([]);
        expect(String(result.message)).toMatch(/не найден/i);
    });

    it('limits the answer size', async () => {
        const result = await call(tools.searchTasks, { limit: 1 });

        expect(result.tasks as unknown[]).toHaveLength(1);
        expect(result.total).toBe(3);
    });

    it('explains an unknown status instead of failing', async () => {
        const result = await call(tools.searchTasks, { status: 'archived' });

        expect(typeof result.error).toBe('string');
    });
});

describe('find_users', () => {
    it('returns a single match', async () => {
        const result = await call(tools.findUsers, { query: 'anna' });

        expect(result.users).toEqual([{ id: 'anna', login: 'anna' }]);
        expect(result.ambiguous).toBe(false);
    });

    it('returns an ambiguous name as a list and marks it ambiguous', async () => {
        const result = await call(tools.findUsers, { query: 'petr' });

        expect((result.users as { id: string }[]).map((u) => u.id)).toEqual(['petr-1', 'petr-2']);
        expect(result.ambiguous).toBe(true);
        expect(String(result.message)).toMatch(/уточн/i);
    });

    it('says that nobody was found', async () => {
        const result = await call(tools.findUsers, { query: 'zzz' });

        expect(result.users).toEqual([]);
        expect(result.ambiguous).toBe(false);
        expect(String(result.message)).toMatch(/не найден/i);
    });

    it('turns a domain failure of the search into text for the agent', async () => {
        vi.spyOn(directory, 'searchActive').mockRejectedValue(
            new ArgumentInvalidError('query is too long'),
        );

        const result = await call(tools.findUsers, { query: 'x' });

        expect(result.users).toEqual([]);
        expect(String(result.error)).toContain('query is too long');
    });
});

describe('update_task', () => {
    let taskId: string;

    beforeEach(async () => {
        await call(tools.createTask, {
            title: 'Отчёт',
            description: 'Квартальный',
            assigneeId: 'anna',
            deadline: '2026-03-01T00:00:00Z',
        });
        taskId = [...tasks.byId.keys()][0];
    });

    it('changes only the passed fields and reports the change', async () => {
        const result = await call(tools.updateTask, { taskId, status: 'done' });

        expect(result).toMatchObject({
            updated: true,
            changed: ['status'],
            task: { status: 'done' },
        });
        const task = tasks.byId.get(taskId);
        expect(task?.title.value).toBe('Отчёт');
        expect(task?.description).toBe('Квартальный');
        expect(task?.assigneeId).toBe('anna');
        expect(task?.deadline).toEqual(new Date('2026-03-01T00:00:00Z'));
    });

    it('can move the deadline, reassign and clear the deadline with null', async () => {
        await call(tools.updateTask, {
            taskId,
            deadline: '2026-04-01T00:00:00Z',
            assigneeId: 'petr-1',
        });
        expect(tasks.byId.get(taskId)?.assigneeId).toBe('petr-1');
        expect(tasks.byId.get(taskId)?.deadline).toEqual(new Date('2026-04-01T00:00:00Z'));

        await call(tools.updateTask, { taskId, deadline: null });
        expect(tasks.byId.get(taskId)?.deadline).toBeNull();
    });

    it('replaces watchers when they are passed', async () => {
        await call(tools.updateTask, { taskId, watcherIds: ['petr-2'] });

        expect(tasks.byId.get(taskId)?.watcherIds).toEqual(['petr-2']);
    });

    it('rejects a call without any field to change and touches nothing', async () => {
        const result = await call(tools.updateTask, { taskId });

        expect(result.updated).toBe(false);
        expect(typeof result.error).toBe('string');
    });

    it('reports a missing task', async () => {
        const result = await call(tools.updateTask, { taskId: 'missing', status: 'done' });

        expect(result.updated).toBe(false);
        expect(String(result.error)).toMatch(/не найден/i);
    });

    it('reports a denied update as unavailable and keeps the data', async () => {
        policy.allowed = false;

        const result = await call(tools.updateTask, { taskId, status: 'done' });

        expect(result.updated).toBe(false);
        expect(String(result.error)).toMatch(/недоступн/i);
        expect(tasks.byId.get(taskId)?.status).toBe('todo');
    });

    it('checks permissions as the run user', async () => {
        await call(build('anna').updateTask, { taskId, status: 'in_progress' });

        expect(policy.canUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'anna' }),
            expect.anything(),
        );
    });

    it('explains an unknown status and does not change the task', async () => {
        const result = await call(tools.updateTask, { taskId, status: 'archived' });

        expect(result.updated).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(tasks.byId.get(taskId)?.status).toBe('todo');
    });

    it('explains an invalid deadline', async () => {
        const result = await call(tools.updateTask, { taskId, deadline: 'скоро' });

        expect(result.updated).toBe(false);
        expect(String(result.error)).toContain('срок');
    });

    it('explains an unknown assignee', async () => {
        const result = await call(tools.updateTask, { taskId, assigneeId: 'nobody' });

        expect(result.updated).toBe(false);
        expect(String(result.error)).toMatch(/пользовател/i);
    });
});
