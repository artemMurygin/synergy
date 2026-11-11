import { tool } from 'langchain';
import { z } from 'zod';
import type { AgentRunContext } from '../../../../shared/agent-capability';
import { ArgumentInvalidError, BaseError } from '../../../../shared/errors';
import type { CreateTaskUseCase } from '../../application/create-task.use-case';
import type { ListTasksUseCase } from '../../application/list-tasks.use-case';
import type { TaskView } from '../../application/task-view';
import type { TaskPatch, UpdateTaskUseCase } from '../../application/update-task.use-case';
import { Actor } from '../../domain/actor';
import { TASK_ACCESS_DENIED } from '../../domain/access-denied.error';
import { TaskErrorCode } from '../../domain/errors';
import type { UserDirectory } from '../../domain/ports/user-directory.port';
import { TaskFilter } from '../../domain/task-filter';
import { TaskSort } from '../../domain/task-sort';
import { TASK_STATUSES } from '../../domain/task-status';

export interface TaskToolsDeps {
    readonly createTask: CreateTaskUseCase;
    readonly listTasks: ListTasksUseCase;
    readonly updateTask: UpdateTaskUseCase;
    readonly users: UserDirectory;
}

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;
const USER_SEARCH_LIMIT = 10;

/** A value the tool shows to the model as an error: plain text, never a stack trace. */
class ToolInputError extends Error {}

function json(value: unknown): string {
    return JSON.stringify(value);
}

function parseDeadline(raw: string | null | undefined): Date | null | undefined {
    if (raw === undefined || raw === null) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        throw new ToolInputError(
            `Некорректный срок «${raw}»: нужна дата и время в формате ISO 8601, например 2026-02-01T09:00:00Z`,
        );
    }
    return date;
}

/** Turns a domain failure into text the model can relay; unknown failures are not swallowed. */
function explain(error: unknown): string {
    if (error instanceof ToolInputError) return error.message;
    if (error instanceof BaseError) {
        switch (error.code) {
            case TaskErrorCode.TaskNotFound:
                return 'Задача не найдена или недоступна пользователю';
            case TaskErrorCode.UserNotFound:
                return 'Пользователь не найден или неактивен: проверь идентификатор через find_users';
            case TASK_ACCESS_DENIED:
                return 'Действие недоступно: у пользователя нет прав на это';
            default:
                if (error instanceof ArgumentInvalidError) {
                    return `Некорректное значение: ${error.message}`;
                }
        }
    }
    throw error;
}

function present(task: TaskView): Record<string, unknown> {
    const login = (ref: { id: string; login: string | null }): string => ref.login ?? ref.id;
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        deadline: task.deadline?.toISOString() ?? null,
        creator: login(task.creator),
        assignee: task.assignee === null ? null : login(task.assignee),
        watchers: task.watchers.map(login),
    };
}

const statusSchema = z
    .string()
    .describe(`Task status: ${TASK_STATUSES.join(', ')} (todo - to do, done - completed)`);
const deadlineSchema = z
    .string()
    .describe('Deadline as ISO 8601 date and time with offset, e.g. 2026-02-01T09:00:00Z');

/**
 * Tools of the tasks agent over the task use cases.
 * The acting user comes only from the run context: no tool accepts a user argument,
 * so the model cannot act on behalf of anyone else.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- tool() generics are inferred per tool
export function createTaskTools(deps: TaskToolsDeps, ctx: AgentRunContext) {
    const actor = Actor.of(ctx.userId);

    const createTask = tool(
        async (input) => {
            try {
                const view = await deps.createTask.execute(actor, {
                    title: input.title,
                    ...(input.description === undefined ? {} : { description: input.description }),
                    ...(input.deadline === undefined
                        ? {}
                        : { deadline: parseDeadline(input.deadline) }),
                    ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
                    ...(input.watcherIds === undefined ? {} : { watcherIds: input.watcherIds }),
                });
                return json({ created: true, task: present(view) });
            } catch (error) {
                return json({ created: false, error: explain(error) });
            }
        },
        {
            name: 'create_task',
            description:
                'Create a task on behalf of the current user. Pass only the fields the user named; never invent a title, deadline or assignee. The assignee is a user id from find_users. Returns the created task or the reason it was rejected.',
            schema: z.object({
                title: z.string().describe('Task title, required'),
                description: z.string().optional().describe('Task description'),
                deadline: deadlineSchema.optional(),
                assigneeId: z.string().optional().describe('Assignee user id from find_users'),
                watcherIds: z
                    .array(z.string())
                    .optional()
                    .describe('Watcher user ids from find_users'),
            }),
        },
    );

    const searchTasks = tool(
        async (input) => {
            try {
                const filter = TaskFilter.of({
                    ...(input.query === undefined ? {} : { titleContains: input.query }),
                    ...(input.status === undefined ? {} : { status: input.status }),
                    ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
                    ...(input.assignedToMe === true ? { assigneeId: actor.userId } : {}),
                    ...(input.createdByMe === true ? { creatorId: actor.userId } : {}),
                    ...(input.overdue === undefined ? {} : { overdue: input.overdue }),
                });
                const limit = Math.min(input.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
                const result = await deps.listTasks.execute(actor, filter, TaskSort.default(), {
                    limit,
                    page: 0,
                });
                if (result.total === 0) {
                    return json({ total: 0, tasks: [], message: 'Задач не найдено' });
                }
                return json({ total: result.total, tasks: result.items.map(present) });
            } catch (error) {
                return json({ error: explain(error) });
            }
        },
        {
            name: 'search_tasks',
            description:
                'Search the tasks the current user may see. All filters are optional and combined with AND. Each result has an "id": use it as taskId in update_task. If several tasks match a request to change one, ask the user which one instead of choosing.',
            schema: z.object({
                query: z.string().optional().describe('Fragment of the task title'),
                status: statusSchema.optional(),
                assigneeId: z.string().optional().describe('Assignee user id from find_users'),
                assignedToMe: z.boolean().optional().describe('Only tasks assigned to the user'),
                createdByMe: z.boolean().optional().describe('Only tasks created by the user'),
                overdue: z.boolean().optional().describe('Only overdue tasks'),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(MAX_SEARCH_LIMIT)
                    .optional()
                    .describe(`How many tasks to return, up to ${String(MAX_SEARCH_LIMIT)}`),
            }),
        },
    );

    const findUsers = tool(
        async (input) => {
            try {
                const found = await deps.users.searchActive(input.query, USER_SEARCH_LIMIT);
                const users = found.map((user) => ({ id: user.id, login: user.login }));
                if (users.length === 0) {
                    return json({ users, ambiguous: false, message: 'Пользователь не найден' });
                }
                if (users.length > 1) {
                    return json({
                        users,
                        ambiguous: true,
                        message:
                            'Найдено несколько пользователей: уточни у пользователя, кого он имеет в виду, и не выбирай сам',
                    });
                }
                return json({ users, ambiguous: false });
            } catch (error) {
                return json({ users: [], error: explain(error) });
            }
        },
        {
            name: 'find_users',
            description:
                'Find active users by a fragment of their name or login, to pick an assignee or a watcher. If several users match, ask the user who is meant; never choose on your own.',
            schema: z.object({
                query: z.string().describe('Fragment of the user name or login'),
            }),
        },
    );

    const updateTask = tool(
        async (input) => {
            try {
                const patch: TaskPatch = {};
                const changed: string[] = [];
                if (input.title !== undefined) {
                    patch.title = input.title;
                    changed.push('title');
                }
                if (input.description !== undefined) {
                    patch.description = input.description;
                    changed.push('description');
                }
                if (input.status !== undefined) {
                    patch.status = input.status;
                    changed.push('status');
                }
                if (input.deadline !== undefined) {
                    patch.deadline = parseDeadline(input.deadline);
                    changed.push('deadline');
                }
                if (input.assigneeId !== undefined) {
                    patch.assigneeId = input.assigneeId;
                    changed.push('assignee');
                }
                if (input.watcherIds !== undefined) {
                    patch.watcherIds = input.watcherIds;
                    changed.push('watchers');
                }
                if (changed.length === 0) {
                    throw new ToolInputError('Не указано ни одного поля для изменения');
                }
                const view = await deps.updateTask.execute(actor, input.taskId, patch);
                return json({ updated: true, changed, task: present(view) });
            } catch (error) {
                return json({ updated: false, error: explain(error) });
            }
        },
        {
            name: 'update_task',
            description:
                'Change an existing task. Pass taskId from search_tasks and only the fields the user asked to change; other fields stay as they are. deadline and assigneeId accept null to clear them. Never guess the task: if the request fits several tasks, ask the user which one.',
            schema: z.object({
                taskId: z.string().describe('Task id from search_tasks'),
                title: z.string().optional().describe('New title'),
                description: z.string().optional().describe('New description'),
                status: statusSchema.optional(),
                deadline: deadlineSchema.nullable().optional(),
                assigneeId: z
                    .string()
                    .nullable()
                    .optional()
                    .describe('New assignee user id from find_users, null to unassign'),
                watcherIds: z
                    .array(z.string())
                    .optional()
                    .describe('Full new list of watcher user ids; replaces the current list'),
            }),
        },
    );

    return { createTask, searchTasks, findUsers, updateTask };
}

export type TaskTools = ReturnType<typeof createTaskTools>;
