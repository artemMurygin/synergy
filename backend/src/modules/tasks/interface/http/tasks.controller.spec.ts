import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { CreateTaskUseCase } from '../../application/create-task.use-case';
import { DeleteTaskUseCase } from '../../application/delete-task.use-case';
import { GetTaskUseCase } from '../../application/get-task.use-case';
import { ListTasksUseCase } from '../../application/list-tasks.use-case';
import type { TaskView } from '../../application/task-view';
import { UpdateTaskUseCase } from '../../application/update-task.use-case';
import { TaskAccessDeniedError } from '../../domain/access-denied.error';
import { TaskNotFoundError, TaskUserNotFoundError } from '../../domain/errors';
import { TaskFilter } from '../../domain/task-filter';
import { TaskSort } from '../../domain/task-sort';
import { TasksController } from './tasks.controller';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const TASK_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const OTHER_ID = '7a1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const create = { execute: vi.fn() };
const get = { execute: vi.fn() };
const list = { execute: vi.fn() };
const update = { execute: vi.fn() };
const remove = { execute: vi.fn() };

const view: TaskView = {
    id: TASK_ID,
    title: 'Подготовить КП',
    description: '',
    status: 'todo',
    deadline: new Date('2026-12-01T09:00:00.000Z'),
    creator: { id: USER_ID, login: 'anna' },
    assignee: { id: OTHER_ID, login: null },
    watchers: [{ id: OTHER_ID, login: null }],
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T10:05:00.000Z'),
    completedAt: null,
};

describe('TasksController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [TasksController],
            providers: [
                { provide: CreateTaskUseCase, useValue: create },
                { provide: GetTaskUseCase, useValue: get },
                { provide: ListTasksUseCase, useValue: list },
                { provide: UpdateTaskUseCase, useValue: update },
                { provide: DeleteTaskUseCase, useValue: remove },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        create.execute.mockResolvedValue(view);
        get.execute.mockResolvedValue({ ...view, attachments: [] });
        update.execute.mockResolvedValue(view);
        remove.execute.mockResolvedValue(undefined);
        list.execute.mockResolvedValue({ items: [view], total: 1, limit: 20, page: 0 });
    });

    function call(
        method: string,
        path: string,
        body?: unknown,
        headers: Record<string, string> = fixture.bearer(),
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    describe('POST /tasks', () => {
        it('creates a task for the token user and answers 201 with the response shape', async () => {
            const response = await call('POST', '/tasks', {
                title: ' Подготовить КП ',
                deadline: '2026-12-01T12:00:00+03:00',
                assigneeId: OTHER_ID,
                watcherIds: [OTHER_ID],
                creatorId: 'someone-else',
            });

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
                id: TASK_ID,
                title: 'Подготовить КП',
                description: '',
                status: 'todo',
                deadline: '2026-12-01T09:00:00.000Z',
                creator: { id: USER_ID, login: 'anna' },
                assignee: { id: OTHER_ID, login: null },
                watchers: [{ id: OTHER_ID, login: null }],
                createdAt: '2026-11-06T10:00:00.000Z',
                updatedAt: '2026-11-06T10:05:00.000Z',
                completedAt: null,
            });
            const [actor, input] = create.execute.mock.calls[0] as [
                { userId: string },
                Record<string, unknown>,
            ];
            expect(actor.userId).toBe(USER_ID);
            expect(input).toEqual({
                title: 'Подготовить КП',
                deadline: new Date('2026-12-01T09:00:00.000Z'),
                assigneeId: OTHER_ID,
                watcherIds: [OTHER_ID],
            });
        });

        it('accepts only a title', async () => {
            expect((await call('POST', '/tasks', { title: 'Минимум' })).status).toBe(201);
            expect(create.execute.mock.calls[0]?.[1]).toEqual({ title: 'Минимум' });
        });

        it.each([
            ['an empty title', { title: '   ' }],
            ['a missing title', {}],
            ['a title over 200 characters', { title: 'я'.repeat(201) }],
            ['a deadline without a time zone', { title: 'a', deadline: '2026-12-01T09:00:00' }],
            ['a non-uuid assignee', { title: 'a', assigneeId: 'abc' }],
            ['a description over 10000 characters', { title: 'a', description: 'x'.repeat(10001) }],
        ])('answers 400 for %s', async (_name, body) => {
            const response = await call('POST', '/tasks', body);
            expect(response.status).toBe(400);
            expect(create.execute).not.toHaveBeenCalled();
        });

        it('answers 422 TASK_USER_NOT_FOUND for an unknown participant', async () => {
            create.execute.mockRejectedValue(new TaskUserNotFoundError([OTHER_ID]));
            const response = await call('POST', '/tasks', { title: 'a', assigneeId: OTHER_ID });
            expect(response.status).toBe(422);
            expect(await response.json()).toMatchObject({ code: 'TASK_USER_NOT_FOUND' });
        });

        it('answers 400 when a domain value object rejects the input', async () => {
            create.execute.mockRejectedValue(new ArgumentInvalidError('too many watchers'));
            expect((await call('POST', '/tasks', { title: 'a' })).status).toBe(400);
        });

        it('answers 401 without a token', async () => {
            const response = await call('POST', '/tasks', { title: 'a' }, {});
            expect(response.status).toBe(401);
            expect(create.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /tasks/:id', () => {
        it('returns the task', async () => {
            const response = await call('GET', `/tasks/${TASK_ID}`);
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ id: TASK_ID, status: 'todo' });
            expect(get.execute.mock.calls[0]?.[0]).toMatchObject({ userId: USER_ID });
            expect(get.execute.mock.calls[0]?.[1]).toBe(TASK_ID);
        });

        it('includes the attachment metadata', async () => {
            get.execute.mockResolvedValue({
                ...view,
                attachments: [
                    {
                        id: TASK_ID,
                        taskId: TASK_ID,
                        originalName: 'Прайс 2026.pdf',
                        sizeBytes: 5,
                        contentType: 'application/pdf',
                        uploadedBy: USER_ID,
                        createdAt: new Date('2026-11-06T10:00:00.000Z'),
                    },
                ],
            });

            const body = (await (await call('GET', `/tasks/${TASK_ID}`)).json()) as {
                attachments: unknown[];
            };

            expect(body.attachments).toEqual([
                {
                    id: TASK_ID,
                    taskId: TASK_ID,
                    originalName: 'Прайс 2026.pdf',
                    sizeBytes: 5,
                    contentType: 'application/pdf',
                    uploadedBy: USER_ID,
                    createdAt: '2026-11-06T10:00:00.000Z',
                },
            ]);
        });

        it('answers 404 TASK_NOT_FOUND', async () => {
            get.execute.mockRejectedValue(new TaskNotFoundError(TASK_ID));
            const response = await call('GET', `/tasks/${TASK_ID}`);
            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ code: 'TASK_NOT_FOUND' });
        });

        it('answers 403 when the access policy refuses', async () => {
            get.execute.mockRejectedValue(new TaskAccessDeniedError(USER_ID, 'read', TASK_ID));
            expect((await call('GET', `/tasks/${TASK_ID}`)).status).toBe(403);
        });

        it('answers 400 for a malformed id', async () => {
            expect((await call('GET', '/tasks/not-a-uuid')).status).toBe(400);
            expect(get.execute).not.toHaveBeenCalled();
        });

        it('answers 401 without a token', async () => {
            expect((await call('GET', `/tasks/${TASK_ID}`, undefined, {})).status).toBe(401);
        });
    });

    describe('GET /tasks', () => {
        it('lists with defaults', async () => {
            const response = await call('GET', '/tasks');

            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                items: [{ id: TASK_ID }],
                total: 1,
                limit: 20,
                page: 0,
            });
            const [, filter, sort, page] = list.execute.mock.calls[0] as [
                unknown,
                TaskFilter,
                TaskSort,
                { limit: number; page: number },
            ];
            expect(filter).toEqual(TaskFilter.of({}));
            expect(sort).toEqual(TaskSort.default());
            expect(page).toEqual({ limit: 20, page: 0 });
        });

        it('passes filters, sorting and pagination from the query', async () => {
            const query = new URLSearchParams({
                status: 'in_progress',
                creatorId: USER_ID,
                assigneeId: OTHER_ID,
                watcherId: OTHER_ID,
                overdue: 'true',
                search: ' КП ',
                sort: 'deadline',
                order: 'asc',
                limit: '10',
                page: '2',
            });
            const response = await call('GET', `/tasks?${query.toString()}`);

            expect(response.status).toBe(200);
            const [, filter, sort, page] = list.execute.mock.calls[0] as [
                unknown,
                TaskFilter,
                TaskSort,
                unknown,
            ];
            expect(filter).toEqual(
                TaskFilter.of({
                    status: 'in_progress',
                    creatorId: USER_ID,
                    assigneeId: OTHER_ID,
                    watcherId: OTHER_ID,
                    overdue: true,
                    titleContains: 'КП',
                }),
            );
            expect(sort).toEqual(TaskSort.of({ field: 'deadline', direction: 'asc' }));
            expect(page).toEqual({ limit: 10, page: 2 });
        });

        it('treats overdue=false as a filter value', async () => {
            await call('GET', '/tasks?overdue=false');
            const filter = list.execute.mock.calls[0]?.[1] as TaskFilter;
            expect(filter.overdue).toBe(false);
        });

        it.each([
            ['an unknown status', 'status=blocked'],
            ['a limit above the maximum', 'limit=101'],
            ['a zero limit', 'limit=0'],
            ['a negative page', 'page=-1'],
            ['an unknown sort field', 'sort=title'],
            ['an unknown direction', 'order=sideways'],
            ['a non-boolean overdue', 'overdue=maybe'],
            ['a non-uuid assignee', 'assigneeId=me'],
        ])('answers 400 for %s', async (_name, query) => {
            expect((await call('GET', `/tasks?${query}`)).status).toBe(400);
            expect(list.execute).not.toHaveBeenCalled();
        });

        it('answers 401 without a token', async () => {
            expect((await call('GET', '/tasks', undefined, {})).status).toBe(401);
        });
    });

    describe('PATCH /tasks/:id', () => {
        it('passes only the provided fields, converting the deadline to a Date', async () => {
            const response = await call('PATCH', `/tasks/${TASK_ID}`, {
                status: 'done',
                deadline: '2026-12-01T09:00:00Z',
            });

            expect(response.status).toBe(200);
            expect(update.execute.mock.calls[0]?.[0]).toMatchObject({ userId: USER_ID });
            expect(update.execute.mock.calls[0]?.[1]).toBe(TASK_ID);
            expect(update.execute.mock.calls[0]?.[2]).toEqual({
                status: 'done',
                deadline: new Date('2026-12-01T09:00:00Z'),
            });
        });

        it('passes null to clear the deadline and the assignee', async () => {
            await call('PATCH', `/tasks/${TASK_ID}`, { deadline: null, assigneeId: null });
            expect(update.execute.mock.calls[0]?.[2]).toEqual({ deadline: null, assigneeId: null });
        });

        it('passes a replacement watcher list, including an empty one', async () => {
            await call('PATCH', `/tasks/${TASK_ID}`, { watcherIds: [] });
            expect(update.execute.mock.calls[0]?.[2]).toEqual({ watcherIds: [] });
        });

        it.each([
            ['an empty patch', {}],
            ['a patch of unknown fields only', { creatorId: OTHER_ID }],
            ['an empty title', { title: ' ' }],
            ['an unknown status', { status: 'blocked' }],
            ['a null title', { title: null }],
        ])('answers 400 for %s', async (_name, body) => {
            expect((await call('PATCH', `/tasks/${TASK_ID}`, body)).status).toBe(400);
            expect(update.execute).not.toHaveBeenCalled();
        });

        it('answers 404 and 422 from the use case', async () => {
            update.execute.mockRejectedValueOnce(new TaskNotFoundError(TASK_ID));
            expect((await call('PATCH', `/tasks/${TASK_ID}`, { title: 'a' })).status).toBe(404);
            update.execute.mockRejectedValueOnce(new TaskUserNotFoundError([OTHER_ID]));
            expect((await call('PATCH', `/tasks/${TASK_ID}`, { title: 'a' })).status).toBe(422);
        });

        it('answers 401 without a token', async () => {
            expect((await call('PATCH', `/tasks/${TASK_ID}`, { title: 'a' }, {})).status).toBe(401);
        });
    });

    describe('DELETE /tasks/:id', () => {
        it('answers 204 without a body', async () => {
            const response = await call('DELETE', `/tasks/${TASK_ID}`);
            expect(response.status).toBe(204);
            expect(await response.text()).toBe('');
            expect(remove.execute.mock.calls[0]?.[1]).toBe(TASK_ID);
        });

        it('answers 404 on a repeated delete', async () => {
            remove.execute.mockRejectedValue(new TaskNotFoundError(TASK_ID));
            expect((await call('DELETE', `/tasks/${TASK_ID}`)).status).toBe(404);
        });

        it('answers 401 without a token', async () => {
            expect((await call('DELETE', `/tasks/${TASK_ID}`, undefined, {})).status).toBe(401);
        });
    });
});
