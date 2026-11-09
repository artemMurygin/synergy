import { beforeEach, describe, expect, it } from 'vitest';
import { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { TaskNotFoundError, TaskUserNotFoundError } from '../domain/errors';
import { FileName } from '../domain/file-name';
import { Task } from '../domain/task';
import { TaskAttachment } from '../domain/task-attachment';
import { TaskTitle } from '../domain/task-title';
import { CreateTaskUseCase } from './create-task.use-case';
import { DeleteTaskUseCase } from './delete-task.use-case';
import { GetTaskUseCase } from './get-task.use-case';
import {
    FakeAccessPolicy,
    FakeUserDirectory,
    InMemoryAttachmentRepository,
    InMemoryTaskRepository,
    NOW,
    fakeClock,
} from './test-doubles';
import { UpdateTaskUseCase } from './update-task.use-case';

const me = Actor.of('me');
const users = [
    { id: 'me', login: 'me' },
    { id: 'anna', login: 'anna' },
    { id: 'boris', login: 'boris' },
    { id: 'carl', login: 'carl' },
];

let tasks: InMemoryTaskRepository;
let attachments: InMemoryAttachmentRepository;
let directory: FakeUserDirectory;
let policy: FakeAccessPolicy;

beforeEach((): void => {
    tasks = new InMemoryTaskRepository();
    attachments = new InMemoryAttachmentRepository();
    directory = new FakeUserDirectory(users);
    policy = new FakeAccessPolicy();
});

const seed = async (
    overrides: { id?: string; assigneeId?: string; watcherIds?: string[] } = {},
): Promise<Task> => {
    const task = Task.create({
        id: overrides.id ?? 't1',
        title: TaskTitle.of('Отчёт'),
        creatorId: 'anna',
        assigneeId: overrides.assigneeId,
        watcherIds: overrides.watcherIds,
        now: new Date('2026-01-01T00:00:00Z'),
    });
    await tasks.save(task);
    return task;
};

describe('CreateTaskUseCase', () => {
    const create = (): CreateTaskUseCase => new CreateTaskUseCase(tasks, directory, fakeClock);

    it('creates a task with the actor as creator and defaults', async () => {
        const view = await create().execute(me, { title: '  Отчёт  ' });

        expect(view.title).toBe('Отчёт');
        expect(view.status).toBe('todo');
        expect(view.description).toBe('');
        expect(view.deadline).toBeNull();
        expect(view.assignee).toBeNull();
        expect(view.watchers).toEqual([]);
        expect(view.creator).toEqual({ id: 'me', login: 'me' });
        expect(view.createdAt).toEqual(NOW);
        expect(tasks.byId.get(view.id)?.creatorId).toBe('me');
    });

    it('ignores a creator passed in the input', async () => {
        const view = await create().execute(me, {
            title: 'Отчёт',
            creatorId: 'anna',
        } as never);

        expect(view.creator.id).toBe('me');
    });

    it('stores assignee, watchers without duplicates, description and deadline', async () => {
        const deadline = new Date('2026-02-01T00:00:00Z');
        const view = await create().execute(me, {
            title: 'Отчёт',
            description: 'Квартальный',
            deadline,
            assigneeId: 'anna',
            watcherIds: ['boris', 'carl', 'boris'],
        });

        expect(view.assignee).toEqual({ id: 'anna', login: 'anna' });
        expect(view.watchers.map((w) => w.id)).toEqual(['boris', 'carl']);
        expect(view.description).toBe('Квартальный');
        expect(view.deadline).toEqual(deadline);
    });

    it('rejects an unknown assignee and does not save', async () => {
        await expect(
            create().execute(me, { title: 'Отчёт', assigneeId: 'ghost' }),
        ).rejects.toBeInstanceOf(TaskUserNotFoundError);
        expect(tasks.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown watcher and reports the offending id', async () => {
        await expect(
            create().execute(me, { title: 'Отчёт', watcherIds: ['anna', 'ghost'] }),
        ).rejects.toMatchObject({ userIds: ['ghost'] });
        expect(tasks.save).not.toHaveBeenCalled();
    });
});

describe('GetTaskUseCase', () => {
    const get = (): GetTaskUseCase => new GetTaskUseCase(tasks, attachments, directory, policy);

    it('returns the task with participants as id and login', async () => {
        await seed({ assigneeId: 'boris', watcherIds: ['carl'] });

        const view = await get().execute(me, 't1');

        expect(view.id).toBe('t1');
        expect(view.creator).toEqual({ id: 'anna', login: 'anna' });
        expect(view.assignee).toEqual({ id: 'boris', login: 'boris' });
        expect(view.watchers).toEqual([{ id: 'carl', login: 'carl' }]);
    });

    it('returns an empty attachment list for a task without files', async () => {
        await seed();

        expect((await get().execute(me, 't1')).attachments).toEqual([]);
    });

    it('returns the metadata of the task attachments only', async () => {
        await seed();
        const make = (id: string, taskId: string, at: string): TaskAttachment =>
            TaskAttachment.create({
                id,
                taskId,
                originalName: FileName.of(`${id}.pdf`),
                storageKey: `key-${id}`,
                sizeBytes: 7,
                contentType: 'application/pdf',
                uploadedBy: 'anna',
                createdAt: new Date(at),
            });
        await attachments.insert(make('a2', 't1', '2026-01-03T00:00:00Z'));
        await attachments.insert(make('a1', 't1', '2026-01-02T00:00:00Z'));
        await attachments.insert(make('other', 't2', '2026-01-02T00:00:00Z'));

        const view = await get().execute(me, 't1');

        expect(view.attachments).toEqual([
            {
                id: 'a1',
                taskId: 't1',
                originalName: 'a1.pdf',
                sizeBytes: 7,
                contentType: 'application/pdf',
                uploadedBy: 'anna',
                createdAt: new Date('2026-01-02T00:00:00Z'),
            },
            expect.objectContaining({ id: 'a2' }),
        ]);
    });

    it('throws TaskNotFound for a missing task', async () => {
        await expect(get().execute(me, 'nope')).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it('throws TaskNotFound for a deleted task', async () => {
        const task = await seed();
        task.softDelete(NOW);

        await expect(get().execute(me, 't1')).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it('asks the policy and stops when read is denied', async () => {
        await seed();
        policy.allowed = false;

        await expect(get().execute(me, 't1')).rejects.toBeInstanceOf(TaskAccessDeniedError);
        expect(policy.canRead).toHaveBeenCalledOnce();
    });

    it('keeps a deactivated participant visible with its id', async () => {
        await seed({ assigneeId: 'ghost' });

        const view = await get().execute(me, 't1');

        expect(view.assignee).toEqual({ id: 'ghost', login: null });
    });
});

describe('UpdateTaskUseCase', () => {
    const update = (): UpdateTaskUseCase =>
        new UpdateTaskUseCase(tasks, directory, policy, fakeClock);

    it('changes only the provided fields', async () => {
        await seed({ assigneeId: 'boris', watcherIds: ['carl'] });

        const view = await update().execute(me, 't1', { title: 'Новое название' });

        expect(view.title).toBe('Новое название');
        expect(view.assignee?.id).toBe('boris');
        expect(view.watchers.map((w) => w.id)).toEqual(['carl']);
        expect(view.creator.id).toBe('anna');
    });

    it('changes the description and the deadline', async () => {
        await seed();
        const deadline = new Date('2026-03-01T00:00:00Z');

        const view = await update().execute(me, 't1', { description: 'Текст', deadline });

        expect(view.description).toBe('Текст');
        expect(view.deadline).toEqual(deadline);
    });

    it('clears the deadline with null', async () => {
        const task = await seed();
        task.changeDeadline(new Date('2026-03-01T00:00:00Z'));

        const view = await update().execute(me, 't1', { deadline: null });

        expect(view.deadline).toBeNull();
    });

    it('clears the assignee with null', async () => {
        await seed({ assigneeId: 'boris' });

        const view = await update().execute(me, 't1', { assigneeId: null });

        expect(view.assignee).toBeNull();
    });

    it('replaces the watchers as a whole', async () => {
        await seed({ watcherIds: ['boris', 'carl'] });

        const view = await update().execute(me, 't1', { watcherIds: ['anna'] });

        expect(view.watchers.map((w) => w.id)).toEqual(['anna']);
    });

    it('sets completedAt on done and resets it on leaving done', async () => {
        await seed();

        const closed = await update().execute(me, 't1', { status: 'done' });
        expect(closed.status).toBe('done');
        expect(closed.completedAt).toEqual(NOW);

        const reopened = await update().execute(me, 't1', { status: 'in_progress' });
        expect(reopened.status).toBe('in_progress');
        expect(reopened.completedAt).toBeNull();
    });

    it('does not move completedAt when done is set again', async () => {
        const task = await seed();
        const earlier = new Date('2026-01-05T00:00:00Z');
        task.changeStatus('done', earlier);

        const view = await update().execute(me, 't1', { status: 'done' });

        expect(view.completedAt).toEqual(earlier);
    });

    it('validates new participants and leaves the task unchanged', async () => {
        await seed({ assigneeId: 'boris' });

        await expect(
            update().execute(me, 't1', { assigneeId: 'ghost', title: 'Другое' }),
        ).rejects.toBeInstanceOf(TaskUserNotFoundError);
        await expect(update().execute(me, 't1', { watcherIds: ['ghost'] })).rejects.toBeInstanceOf(
            TaskUserNotFoundError,
        );

        expect(tasks.save).toHaveBeenCalledTimes(1); // only the seed
        expect(tasks.byId.get('t1')?.assigneeId).toBe('boris');
        expect(tasks.byId.get('t1')?.title.value).toBe('Отчёт');
    });

    it('throws TaskNotFound for a missing or deleted task', async () => {
        await expect(update().execute(me, 'nope', { title: 'x' })).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );
        const task = await seed();
        task.softDelete(NOW);
        await expect(update().execute(me, 't1', { title: 'x' })).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );
    });

    it('asks the policy and stops when update is denied', async () => {
        await seed();
        policy.allowed = false;

        await expect(update().execute(me, 't1', { title: 'Другое' })).rejects.toBeInstanceOf(
            TaskAccessDeniedError,
        );
        expect(policy.canUpdate).toHaveBeenCalledOnce();
        expect(tasks.save).toHaveBeenCalledTimes(1); // only the seed
        expect(tasks.byId.get('t1')?.title.value).toBe('Отчёт');
    });
});

describe('DeleteTaskUseCase', () => {
    const remove = (): DeleteTaskUseCase => new DeleteTaskUseCase(tasks, policy, fakeClock);

    it('soft-deletes the task and keeps the record', async () => {
        await seed();

        await remove().execute(me, 't1');

        expect(tasks.byId.get('t1')?.deletedAt).toEqual(NOW);
        expect(await tasks.findById('t1')).toBeNull();
    });

    it('answers not found on a repeated delete', async () => {
        await seed();
        await remove().execute(me, 't1');

        await expect(remove().execute(me, 't1')).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it('throws TaskNotFound for a missing task', async () => {
        await expect(remove().execute(me, 'nope')).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it('asks the policy and stops when delete is denied', async () => {
        await seed();
        policy.allowed = false;

        await expect(remove().execute(me, 't1')).rejects.toBeInstanceOf(TaskAccessDeniedError);
        expect(policy.canDelete).toHaveBeenCalledOnce();
        expect(tasks.byId.get('t1')?.deletedAt).toBeNull();
    });
});
