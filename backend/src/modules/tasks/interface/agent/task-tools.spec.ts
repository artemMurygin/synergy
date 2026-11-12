import { toJSONSchema } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunContext } from '../../../../shared/agent-capability';
import { ArgumentInvalidError } from '../../../../shared/errors';
import type { StoredFileView } from '../../../files/application/stored-file-view';
import { silentLogger } from '../../../files/application/test-doubles';
import { CreateTaskUseCase, type CreateTaskInput } from '../../application/create-task.use-case';
import { CreateTasksFromDraftUseCase } from '../../application/create-tasks-from-draft.use-case';
import { GetTaskUseCase } from '../../application/get-task.use-case';
import { ListTasksUseCase } from '../../application/list-tasks.use-case';
import { ProposeTasksUseCase } from '../../application/propose-tasks.use-case';
import type { TasksReportDocument } from '../../application/tasks-report-document';
import {
    FakeAccessPolicy,
    FakeUserDirectory,
    InMemoryAttachmentRepository,
    InMemoryTaskBatchDraftRepository,
    InMemoryTaskRepository,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
    fakeClock,
} from '../../application/test-doubles';
import { UpdateTaskUseCase } from '../../application/update-task.use-case';
import { Actor } from '../../domain/actor';
import { createTaskTools, type TaskTools } from './task-tools';

const users = [
    { id: 'me', login: 'me' },
    { id: 'petr-1', login: 'petr.ivanov' },
    { id: 'petr-2', login: 'petr.sidorov' },
    { id: 'anna', login: 'anna' },
];

const REPORT: StoredFileView = {
    id: 'report-1',
    name: 'Поставленные задачи — Планёрка.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'document',
    sizeBytes: 2048,
    status: 'active',
    awaitingProcessing: false,
    uploadedAt: new Date('2026-01-10T12:00:00Z'),
    expiresAt: null,
    deletedAt: null,
};

let tasks: InMemoryTaskRepository;
let drafts: InMemoryTaskBatchDraftRepository;
let directory: FakeUserDirectory;
let policy: FakeAccessPolicy;
let createTask: CreateTaskUseCase;
let issueReport: ReturnType<typeof vi.fn>;
let ctx: AgentRunContext;
let tools: TaskTools;

function build(userId = 'me', threadId = 'thread-1'): TaskTools {
    const transactions = new SnapshotTransactionRunner([tasks, drafts]);
    const events = new RecordingEventPublisher(transactions);
    const attachments = new InMemoryAttachmentRepository();
    createTask = new CreateTaskUseCase(tasks, directory, fakeClock, transactions, events);
    ctx = AgentRunContext.create({ userId, threadId });
    return createTaskTools(
        {
            proposeTasks: new ProposeTasksUseCase(drafts, directory, fakeClock, transactions),
            createTasksFromDraft: new CreateTasksFromDraftUseCase(
                drafts,
                createTask,
                { issue: issueReport } as unknown as TasksReportDocument,
                silentLogger(),
            ),
            getTask: new GetTaskUseCase(tasks, attachments, directory, policy),
            listTasks: new ListTasksUseCase(tasks, attachments, directory),
            updateTask: new UpdateTaskUseCase(tasks, attachments, directory, policy, fakeClock),
            users: directory,
        },
        ctx,
    );
}

/** Seeds a task directly through the use case, as the app would. */
async function seed(userId: string, input: CreateTaskInput): Promise<string> {
    const view = await createTask.execute(Actor.of(userId), input);
    return view.id;
}

async function call(
    tool: { invoke(input: never): Promise<unknown> },
    input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const raw = await tool.invoke(input as never);
    return JSON.parse(raw as string) as Record<string, unknown>;
}

/** propose_tasks, then create_tasks for the returned draft. */
async function proposeAndCreate(
    items: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
    toolset: TaskTools = tools,
): Promise<{ proposed: Record<string, unknown>; created: Record<string, unknown> }> {
    const proposed = await call(toolset.proposeTasks, { items, ...extra });
    const created = await call(toolset.createTasks, { draftId: proposed.draftId });
    return { proposed, created };
}

beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    drafts = new InMemoryTaskBatchDraftRepository();
    directory = new FakeUserDirectory(users);
    policy = new FakeAccessPolicy();
    issueReport = vi.fn(() => Promise.resolve(REPORT));
    tools = build();
});

describe('tool contracts', () => {
    it('exposes propose_tasks and create_tasks instead of create_task', () => {
        expect(Object.values(tools).map((tool) => tool.name)).toEqual([
            'propose_tasks',
            'create_tasks',
            'search_tasks',
            'find_users',
            'update_task',
        ]);
    });

    it('never offers the model a parameter for the acting user or the initiator', () => {
        for (const tool of Object.values(tools)) {
            const schema = toJSONSchema(tool.schema as never) as {
                properties?: Record<string, { items?: { properties?: Record<string, unknown> } }>;
            };
            const nested = Object.values(schema.properties ?? {}).flatMap((property) =>
                Object.keys(property.items?.properties ?? {}),
            );
            const keys = [...Object.keys(schema.properties ?? {}), ...nested].map((key) =>
                key.toLowerCase(),
            );
            expect(keys).not.toContain('userid');
            expect(keys).not.toContain('initiatorid');
            expect(keys).not.toContain('actor');
            expect(keys).not.toContain('user');
            expect(Object.keys(schema.properties ?? {})).not.toContain('creatorId');
        }
    });
});

describe('propose_tasks', () => {
    it('stores the list as a draft and returns numbered cards without creating anything', async () => {
        const result = await call(tools.proposeTasks, {
            items: [
                { title: 'Подготовить КП', assigneeId: 'anna', deadline: '2026-02-01T09:00:00Z' },
                { title: 'Созвон с клиентом' },
            ],
        });

        expect(result.proposed).toBe(true);
        expect(typeof result.draftId).toBe('string');
        expect(result.cards).toEqual([
            expect.objectContaining({
                number: 1,
                title: 'Подготовить КП',
                assignee: 'anna',
                creator: 'me',
                onBehalf: false,
                deadline: '2026-02-01T09:00:00.000Z',
            }),
            expect.objectContaining({ number: 2, title: 'Созвон с клиентом', assignee: null }),
        ]);
        expect(tasks.byId.size).toBe(0);
        expect([...drafts.byId.values()][0]).toMatchObject({ threadId: 'thread-1', ownerId: 'me' });
    });

    it('marks a card whose creator is another user as on behalf', async () => {
        const result = await call(tools.proposeTasks, {
            items: [{ title: 'От Петра', creatorId: 'petr-1' }],
        });

        expect(result.cards).toEqual([
            expect.objectContaining({ creator: 'petr.ivanov', onBehalf: true }),
        ]);
    });

    it('names the task number of an unknown assignee and shows no cards', async () => {
        const result = await call(tools.proposeTasks, {
            items: [{ title: 'Первая' }, { title: 'Вторая', assigneeId: 'nobody' }],
        });

        expect(result.proposed).toBe(false);
        expect(String(result.error)).toMatch(/2/);
        expect(String(result.error)).toMatch(/исполнител/i);
        expect(result).not.toHaveProperty('cards');
    });

    it('names an unknown creator', async () => {
        const result = await call(tools.proposeTasks, {
            items: [{ title: 'Первая', creatorId: 'nobody' }],
        });

        expect(result.proposed).toBe(false);
        expect(String(result.error)).toMatch(/постановщик/i);
    });

    it('names the task with an invalid deadline', async () => {
        const result = await call(tools.proposeTasks, {
            items: [{ title: 'Первая' }, { title: 'Вторая', deadline: 'завтра' }],
        });

        expect(result.proposed).toBe(false);
        expect(String(result.error)).toMatch(/2/);
        expect(String(result.error)).toContain('срок');
    });

    it('refuses a list longer than 30 tasks and asks to split it', async () => {
        const items = Array.from({ length: 31 }, (_, i) => ({ title: `Задача ${String(i + 1)}` }));

        const result = await call(tools.proposeTasks, { items });

        expect(result.proposed).toBe(false);
        expect(String(result.error)).toMatch(/30/);
        expect(String(result.error)).toMatch(/разб/i);
        expect(drafts.byId.size).toBe(0);
    });

    it('passes the meeting origin when the list came from a meeting', async () => {
        await call(tools.proposeTasks, {
            items: [{ title: 'Из встречи' }],
            origin: { fileId: 'f-1', recordingName: 'Планёрка.m4a' },
        });

        expect([...drafts.byId.values()][0].origin).toEqual({
            kind: 'meeting',
            fileId: 'f-1',
            recordingName: 'Планёрка.m4a',
        });
    });

    it('stores no origin for a list the user typed', async () => {
        await call(tools.proposeTasks, { items: [{ title: 'Своя' }] });

        expect([...drafts.byId.values()][0].origin).toBeNull();
    });

    it('supersedes the previous draft of the thread: only the last list can be confirmed', async () => {
        const first = await call(tools.proposeTasks, { items: [{ title: 'Первая' }] });
        await call(tools.proposeTasks, { items: [{ title: 'Исправленная' }] });

        const result = await call(tools.createTasks, { draftId: first.draftId });

        expect(result.created).toBe(false);
        expect(tasks.byId.size).toBe(0);
    });
});

describe('create_tasks', () => {
    it('creates a single task through the same propose/create path, on behalf of the run user', async () => {
        const { created } = await proposeAndCreate([
            { title: 'Подготовить отчёт', assigneeId: 'anna', deadline: '2026-02-01T09:00:00Z' },
        ]);

        expect(created).toMatchObject({
            created: true,
            createdCount: 1,
            failedCount: 0,
            tasks: [
                {
                    number: 1,
                    status: 'created',
                    title: 'Подготовить отчёт',
                    assignee: 'anna',
                    creator: 'me',
                },
            ],
            report: null,
        });
        const [saved] = [...tasks.byId.values()];
        expect(saved.creatorId).toBe('me');
        expect(saved.initiatorId).toBe('me');
        expect(saved.assigneeId).toBe('anna');
        expect(saved.deadline).toEqual(new Date('2026-02-01T09:00:00Z'));
    });

    it('creates every task of the list separately and reports each one', async () => {
        const { created } = await proposeAndCreate([
            { title: 'Первая' },
            { title: 'Вторая', assigneeId: 'petr-2' },
            { title: 'Третья' },
        ]);

        expect(created.createdCount).toBe(3);
        expect((created.tasks as { number: number }[]).map((task) => task.number)).toEqual([
            1, 2, 3,
        ]);
        expect(tasks.byId.size).toBe(3);
    });

    it('keeps the creator chosen by the user and records the run user as the initiator', async () => {
        const { created } = await proposeAndCreate([{ title: 'От Петра', creatorId: 'petr-1' }]);

        expect(created.tasks).toEqual([
            expect.objectContaining({ creator: 'petr.ivanov', onBehalf: true }),
        ]);
        const [saved] = [...tasks.byId.values()];
        expect(saved.creatorId).toBe('petr-1');
        expect(saved.initiatorId).toBe('me');
    });

    it('takes the initiator from the run context of each built toolset', async () => {
        await proposeAndCreate([{ title: 'Задача Анны' }], {}, build('anna', 'thread-anna'));

        const [saved] = [...tasks.byId.values()];
        expect(saved.creatorId).toBe('anna');
        expect(saved.initiatorId).toBe('anna');
    });

    it('ignores an initiator or user passed in the arguments', async () => {
        const proposed = await call(tools.proposeTasks, {
            items: [{ title: 'Хитрая', initiatorId: 'petr-1', userId: 'petr-1' }],
            userId: 'petr-1',
        });
        await call(tools.createTasks, { draftId: proposed.draftId, userId: 'petr-1' });

        const [saved] = [...tasks.byId.values()];
        expect(saved.initiatorId).toBe('me');
        expect(saved.creatorId).toBe('me');
    });

    it('does not invent fields: omitted fields stay empty', async () => {
        await proposeAndCreate([{ title: 'Только заголовок' }]);

        const [saved] = [...tasks.byId.values()];
        expect(saved.assigneeId).toBeNull();
        expect(saved.deadline).toBeNull();
        expect(saved.description).toBe('');
        expect(saved.watcherIds).toEqual([]);
    });

    it('does not create the tasks a second time on a repeated confirmation', async () => {
        const { proposed } = await proposeAndCreate([{ title: 'Одна' }]);

        const again = await call(tools.createTasks, { draftId: proposed.draftId });

        expect(again.created).toBe(false);
        expect(String(again.error)).toMatch(/уже/i);
        expect(tasks.byId.size).toBe(1);
    });

    it('reports a failed task with its reason and keeps the others', async () => {
        const proposed = await call(tools.proposeTasks, {
            items: [
                { title: 'Первая' },
                { title: 'Вторая', assigneeId: 'anna' },
                { title: 'Третья' },
            ],
        });
        directory.users.delete('anna');

        const created = await call(tools.createTasks, { draftId: proposed.draftId });

        expect(created).toMatchObject({ created: true, createdCount: 2, failedCount: 1 });
        expect((created.tasks as Record<string, unknown>[])[1]).toMatchObject({
            number: 2,
            status: 'failed',
        });
        expect(String((created.tasks as Record<string, unknown>[])[1].reason)).toMatch(
            /исполнитель/i,
        );
        expect(tasks.byId.size).toBe(2);
    });

    it('still reports a created task when reading it back for the summary fails', async () => {
        policy.canRead.mockReturnValue(false);

        const { created } = await proposeAndCreate([{ title: 'Скрытая' }]);

        expect(created).toMatchObject({
            created: true,
            createdCount: 1,
            tasks: [{ number: 1, status: 'created' }],
        });
        expect(tasks.byId.size).toBe(1);
    });

    it('explains an unknown draft', async () => {
        const result = await call(tools.createTasks, { draftId: 'missing' });

        expect(result.created).toBe(false);
        expect(String(result.error)).toMatch(/propose_tasks/);
    });

    it('puts the report document of a meeting list into the run attachments', async () => {
        const { created } = await proposeAndCreate([{ title: 'Из встречи' }], {
            origin: { fileId: 'f-1', recordingName: 'Планёрка.m4a' },
        });

        expect(issueReport).toHaveBeenCalledTimes(1);
        expect(created.report).toEqual({ name: REPORT.name });
        expect(ctx.attachments.list()).toEqual([
            expect.objectContaining({
                fileId: 'report-1',
                name: REPORT.name,
                mediaType: REPORT.mediaType,
                kind: 'document',
                sizeBytes: 2048,
            }),
        ]);
    });

    it('attaches nothing for a list the user typed', async () => {
        const { created } = await proposeAndCreate([{ title: 'Своя' }]);

        expect(issueReport).not.toHaveBeenCalled();
        expect(created.report).toBeNull();
        expect(ctx.attachments.list()).toEqual([]);
    });
});

describe('search_tasks', () => {
    beforeEach(async () => {
        await seed('me', { title: 'Отчёт для Пети', assigneeId: 'petr-1' });
        await seed('me', { title: 'Закупка', assigneeId: 'me' });
        await seed('anna', { title: 'Задача Анны', assigneeId: 'anna' });
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
        taskId = await seed('me', {
            title: 'Отчёт',
            description: 'Квартальный',
            assigneeId: 'anna',
            deadline: new Date('2026-03-01T00:00:00Z'),
        });
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
