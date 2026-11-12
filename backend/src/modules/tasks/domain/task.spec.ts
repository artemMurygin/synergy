import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '../../../shared/context/request-context';
import { TaskCreatedEvent } from '../contracts/task-created.event';
import { TaskNotFoundError } from './errors';
import {
    InvalidTaskDescriptionError,
    InvalidTaskStateError,
    InvalidTaskWatchersError,
    MAX_TASK_DESCRIPTION_LENGTH,
    MAX_TASK_WATCHERS,
    Task,
} from './task';
import { TaskTitle } from './task-title';

const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-01-02T00:00:00Z');
const t2 = new Date('2026-01-03T00:00:00Z');

const minimal = (): Task =>
    Task.create({ id: 't1', title: TaskTitle.of('Отчёт'), creatorId: 'creator', now: t0 });

const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `u${String(i)}`);

afterEach(() => {
    vi.useRealTimers();
});

describe('Task creation', () => {
    it('creates a task with only a title', () => {
        const task = minimal();
        expect(task.title.value).toBe('Отчёт');
        expect(task.status).toBe('todo');
        expect(task.description).toBe('');
        expect(task.deadline).toBeNull();
        expect(task.assigneeId).toBeNull();
        expect(task.watcherIds).toEqual([]);
        expect(task.creatorId).toBe('creator');
        expect(task.completedAt).toBeNull();
        expect(task.deletedAt).toBeNull();
        expect(task.isDeleted()).toBe(false);
        expect(task.createdAt).toEqual(t0);
        expect(task.updatedAt).toEqual(t0);
    });

    it('makes the creator the initiator by default', () => {
        expect(minimal().initiatorId).toBe('creator');
    });

    it('keeps an initiator that differs from the creator', () => {
        const task = Task.create({
            id: 't1',
            title: TaskTitle.of('Отчёт'),
            creatorId: 'creator',
            initiatorId: 'initiator',
            now: t0,
        });

        expect(task.creatorId).toBe('creator');
        expect(task.initiatorId).toBe('initiator');
    });

    it('keeps all provided fields', () => {
        const deadline = new Date('2026-02-01T00:00:00Z');
        const task = Task.create({
            id: 't2',
            title: TaskTitle.of('Полная'),
            description: 'Описание',
            deadline,
            creatorId: 'creator',
            assigneeId: 'a1',
            watcherIds: ['w1', 'w2', 'w3'],
            now: t0,
        });
        expect(task.description).toBe('Описание');
        expect(task.deadline).toEqual(deadline);
        expect(task.assigneeId).toBe('a1');
        expect(task.watcherIds).toEqual(['w1', 'w2', 'w3']);
    });

    it('accepts a description of exactly 10000 characters', () => {
        const task = Task.create({
            id: 't3',
            title: TaskTitle.of('x'),
            description: 'a'.repeat(MAX_TASK_DESCRIPTION_LENGTH),
            creatorId: 'creator',
            now: t0,
        });
        expect(task.description).toHaveLength(MAX_TASK_DESCRIPTION_LENGTH);
    });

    it('rejects a description longer than 10000 characters', () => {
        expect(() =>
            Task.create({
                id: 't3',
                title: TaskTitle.of('x'),
                description: 'a'.repeat(MAX_TASK_DESCRIPTION_LENGTH + 1),
                creatorId: 'creator',
                now: t0,
            }),
        ).toThrow(InvalidTaskDescriptionError);
    });

    it('drops duplicate watchers on creation', () => {
        const task = Task.create({
            id: 't4',
            title: TaskTitle.of('x'),
            creatorId: 'creator',
            watcherIds: ['w1', 'w1', 'w2', 'w1'],
            now: t0,
        });
        expect(task.watcherIds).toEqual(['w1', 'w2']);
    });

    it('rejects more than 50 watchers on creation', () => {
        expect(() =>
            Task.create({
                id: 't4',
                title: TaskTitle.of('x'),
                creatorId: 'creator',
                watcherIds: ids(MAX_TASK_WATCHERS + 1),
                now: t0,
            }),
        ).toThrow(InvalidTaskWatchersError);
    });
});

describe('Task.restore', () => {
    it('keeps persisted state without recomputing it', () => {
        const task = Task.restore({
            id: 't5',
            title: TaskTitle.of('Из БД'),
            description: 'd',
            status: 'done',
            deadline: null,
            creatorId: 'creator',
            initiatorId: 'initiator',
            assigneeId: 'a1',
            watcherIds: ['w1'],
            createdAt: t0,
            updatedAt: t1,
            completedAt: t1,
            deletedAt: null,
        });
        expect(task.status).toBe('done');
        expect(task.initiatorId).toBe('initiator');
        expect(task.completedAt).toEqual(t1);
        expect(task.createdAt).toEqual(t0);
        expect(task.updatedAt).toEqual(t1);
    });

    it('does not raise domain events', () => {
        const task = Task.restore({
            id: 't5',
            title: TaskTitle.of('Из БД'),
            description: '',
            status: 'todo',
            deadline: null,
            creatorId: 'creator',
            initiatorId: 'creator',
            assigneeId: 'a1',
            watcherIds: [],
            createdAt: t0,
            updatedAt: t0,
            completedAt: null,
            deletedAt: null,
        });

        expect(task.pullDomainEvents()).toEqual([]);
    });
});

describe('Task.create domain events', () => {
    it('raises exactly one TaskCreatedEvent with the task facts', () => {
        const task = Task.create({
            id: 't7',
            title: TaskTitle.of('  Подготовить КП  '),
            creatorId: 'creator',
            assigneeId: 'a1',
            now: t0,
        });

        const events = task.pullDomainEvents();

        expect(events).toHaveLength(1);
        const [created] = events;
        expect(created).toBeInstanceOf(TaskCreatedEvent);
        if (!(created instanceof TaskCreatedEvent)) return;
        expect(created.aggregateId).toBe('t7');
        expect(created.taskId).toBe('t7');
        expect(created.title).toBe('Подготовить КП');
        expect(created.creatorId).toBe('creator');
        expect(created.initiatorId).toBe('creator');
        expect(created.assigneeId).toBe('a1');
    });

    it('carries the initiator and stamps it as the acting user', () => {
        const task = Task.create({
            id: 't9',
            title: TaskTitle.of('КП'),
            creatorId: 'creator',
            initiatorId: 'initiator',
            now: t0,
        });

        const [created] = task.pullDomainEvents();

        expect(created).toBeInstanceOf(TaskCreatedEvent);
        if (!(created instanceof TaskCreatedEvent)) return;
        expect(created.creatorId).toBe('creator');
        expect(created.initiatorId).toBe('initiator');
        expect(created.metadata.userId).toBe('initiator');
    });

    it('stamps the event with the creation time, creator and request correlation id', () => {
        const task = RequestContext.run({ requestId: 'req-1', correlationId: 'corr-7' }, () =>
            Task.create({ id: 't8', title: TaskTitle.of('КП'), creatorId: 'creator', now: t0 }),
        );

        const [created] = task.pullDomainEvents();

        expect(created.metadata).toMatchObject({
            timestamp: t0.getTime(),
            correlationId: 'corr-7',
            userId: 'creator',
        });
    });

    it('carries a null assignee when the task has none', () => {
        const [created] = minimal().pullDomainEvents();

        expect(created).toBeInstanceOf(TaskCreatedEvent);
        if (!(created instanceof TaskCreatedEvent)) return;
        expect(created.assigneeId).toBeNull();
    });

    it('hands the event out only once', () => {
        const task = minimal();
        task.pullDomainEvents();

        expect(task.pullDomainEvents()).toEqual([]);
    });
});

describe('Task.restore invariants', () => {
    const base = {
        id: 't6',
        title: TaskTitle.of('Из БД'),
        description: '',
        deadline: null,
        creatorId: 'creator',
        initiatorId: 'creator',
        assigneeId: null,
        watcherIds: [],
        createdAt: t0,
        updatedAt: t1,
        deletedAt: null,
    };

    it('rejects a done task without completedAt', () => {
        expect(() => Task.restore({ ...base, status: 'done', completedAt: null })).toThrow(
            InvalidTaskStateError,
        );
    });

    it('rejects completedAt on a task that is not done', () => {
        expect(() => Task.restore({ ...base, status: 'todo', completedAt: t1 })).toThrow(
            InvalidTaskStateError,
        );
    });
});

describe('Task.replaceWatchers', () => {
    it('replaces the whole list and removes duplicates', () => {
        const task = minimal();
        task.replaceWatchers(['w1', 'w2']);
        task.replaceWatchers(['w3', 'w3', 'w4']);
        expect(task.watcherIds).toEqual(['w3', 'w4']);
    });

    it('accepts exactly 50 unique watchers', () => {
        const task = minimal();
        task.replaceWatchers(ids(MAX_TASK_WATCHERS));
        expect(task.watcherIds).toHaveLength(MAX_TASK_WATCHERS);
    });

    it('counts unique ids against the limit', () => {
        const task = minimal();
        task.replaceWatchers([...ids(MAX_TASK_WATCHERS), ...ids(MAX_TASK_WATCHERS)]);
        expect(task.watcherIds).toHaveLength(MAX_TASK_WATCHERS);
    });

    it('rejects more than 50 and keeps the previous list', () => {
        const task = minimal();
        task.replaceWatchers(['w1']);
        expect(() => {
            task.replaceWatchers(ids(MAX_TASK_WATCHERS + 1));
        }).toThrow(InvalidTaskWatchersError);
        expect(task.watcherIds).toEqual(['w1']);
    });

    it('clears the list with an empty array', () => {
        const task = minimal();
        task.replaceWatchers(['w1']);
        task.replaceWatchers([]);
        expect(task.watcherIds).toEqual([]);
    });
});

describe('Task field changes', () => {
    it('changes title, description, deadline and assignee', () => {
        const task = minimal();
        const deadline = new Date('2026-03-01T00:00:00Z');
        task.rename(TaskTitle.of('Новое'));
        task.changeDescription('Текст');
        task.changeDeadline(deadline);
        task.assign('a1');
        expect(task.title.value).toBe('Новое');
        expect(task.description).toBe('Текст');
        expect(task.deadline).toEqual(deadline);
        expect(task.assigneeId).toBe('a1');
    });

    it('clears the deadline and the assignee with null', () => {
        const task = minimal();
        task.changeDeadline(new Date('2026-03-01T00:00:00Z'));
        task.assign('a1');
        task.changeDeadline(null);
        task.assign(null);
        expect(task.deadline).toBeNull();
        expect(task.assigneeId).toBeNull();
    });

    it('rejects a too long description on change', () => {
        const task = minimal();
        expect(() => {
            task.changeDescription('a'.repeat(MAX_TASK_DESCRIPTION_LENGTH + 1));
        }).toThrow(InvalidTaskDescriptionError);
        expect(task.description).toBe('');
    });

    it('never changes the creator', () => {
        const task = minimal();
        task.rename(TaskTitle.of('Другое'));
        task.assign('someone');
        task.replaceWatchers(['w1']);
        task.changeStatus('done', t1);
        expect(task.creatorId).toBe('creator');
    });

    it('bumps updatedAt on every change', () => {
        vi.useFakeTimers();
        vi.setSystemTime(t2);
        const task = minimal();
        task.rename(TaskTitle.of('Новое'));
        expect(task.updatedAt).toEqual(t2);
    });
});

describe('Task.changeStatus', () => {
    it('sets completedAt when moving to done', () => {
        const task = minimal();
        task.changeStatus('in_progress', t1);
        expect(task.completedAt).toBeNull();
        task.changeStatus('done', t1);
        expect(task.status).toBe('done');
        expect(task.completedAt).toEqual(t1);
    });

    it('clears completedAt when leaving done', () => {
        const task = minimal();
        task.changeStatus('done', t1);
        task.changeStatus('in_progress', t2);
        expect(task.status).toBe('in_progress');
        expect(task.completedAt).toBeNull();
    });

    it('does not move completedAt when done is set again', () => {
        const task = minimal();
        task.changeStatus('done', t1);
        task.changeStatus('done', t2);
        expect(task.completedAt).toEqual(t1);
    });

    it('allows a transition between any two statuses', () => {
        const task = minimal();
        task.changeStatus('done', t1);
        task.changeStatus('todo', t1);
        task.changeStatus('in_progress', t1);
        task.changeStatus('todo', t1);
        expect(task.status).toBe('todo');
    });
});

describe('Task.softDelete', () => {
    it('sets deletedAt', () => {
        const task = minimal();
        task.softDelete(t1);
        expect(task.deletedAt).toEqual(t1);
        expect(task.isDeleted()).toBe(true);
    });

    it('rejects every change of a deleted task as not found', () => {
        const task = minimal();
        task.softDelete(t1);
        expect(() => {
            task.rename(TaskTitle.of('x'));
        }).toThrow(TaskNotFoundError);
        expect(() => {
            task.changeDescription('x');
        }).toThrow(TaskNotFoundError);
        expect(() => {
            task.changeDeadline(null);
        }).toThrow(TaskNotFoundError);
        expect(() => {
            task.assign('a1');
        }).toThrow(TaskNotFoundError);
        expect(() => {
            task.replaceWatchers(['w1']);
        }).toThrow(TaskNotFoundError);
        expect(() => {
            task.changeStatus('done', t2);
        }).toThrow(TaskNotFoundError);
        expect(() => {
            task.softDelete(t2);
        }).toThrow(TaskNotFoundError);
        expect(task.deletedAt).toEqual(t1);
    });
});
