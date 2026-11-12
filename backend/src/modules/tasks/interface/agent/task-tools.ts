import { tool } from 'langchain';
import { z } from 'zod';
import { AttachmentRef, type AgentRunContext } from '../../../../shared/agent-capability';
import { ArgumentInvalidError, BaseError } from '../../../../shared/errors';
import type {
    CreateTasksFromDraftUseCase,
    DraftTaskOutcomeView,
} from '../../application/create-tasks-from-draft.use-case';
import type { ListTasksUseCase } from '../../application/list-tasks.use-case';
import type {
    DraftCardView,
    ProposeTasksUseCase,
    ProposedItemInput,
} from '../../application/propose-tasks.use-case';
import type { TaskView } from '../../application/task-view';
import type { TaskPatch, UpdateTaskUseCase } from '../../application/update-task.use-case';
import { Actor } from '../../domain/actor';
import { TASK_ACCESS_DENIED } from '../../domain/access-denied.error';
import { TaskErrorCode } from '../../domain/errors';
import type { UserDirectory } from '../../domain/ports/user-directory.port';
import {
    DraftAlreadyUsedError,
    DraftNotFoundError,
    EmptyTaskBatchError,
    InvalidDraftItemError,
    MAX_DRAFT_TASKS,
    MeetingRecordingNotFoundError,
    TooManyDraftTasksError,
    UnknownDraftUserError,
    type DraftUserField,
} from '../../domain/task-batch-errors';
import { TaskFilter } from '../../domain/task-filter';
import { TaskSort } from '../../domain/task-sort';
import { TASK_STATUSES } from '../../domain/task-status';

export interface TaskToolsDeps {
    readonly proposeTasks: ProposeTasksUseCase;
    readonly createTasksFromDraft: CreateTasksFromDraftUseCase;
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

const USER_FIELD_LABELS: Record<DraftUserField, string> = {
    assignee: 'исполнитель',
    creator: 'постановщик',
    watcher: 'наблюдатель',
};

/** Failures of a task list, named by the task number the user sees on the card. */
function explainBatch(error: unknown): string | null {
    if (error instanceof TooManyDraftTasksError) {
        return `В списке ${String(error.count)} задач, а одним подтверждением можно создать не больше ${String(MAX_DRAFT_TASKS)}: предложи пользователю разбить список на части и ничего не создавай`;
    }
    if (error instanceof EmptyTaskBatchError) return 'Список задач пуст';
    if (error instanceof UnknownDraftUserError) {
        return `Задача ${String(error.index)}: ${USER_FIELD_LABELS[error.field]} не найден или неактивен: проверь через find_users и уточни у пользователя`;
    }
    if (error instanceof InvalidDraftItemError) {
        return `Некорректное значение: ${error.message}`;
    }
    if (error instanceof MeetingRecordingNotFoundError) {
        return 'Запись встречи не найдена среди записей пользователя: передай в origin идентификатор файла записи от специалиста по встречам или не передавай origin';
    }
    if (error instanceof DraftNotFoundError) {
        return 'Список не найден: покажи список заново через propose_tasks и дождись подтверждения';
    }
    if (error instanceof DraftAlreadyUsedError) {
        return error.status === 'consumed'
            ? 'Задачи по этому списку уже созданы: повторно ничего не создано'
            : 'Этот список уже заменён новым: подтверждать можно только последний показанный список';
    }
    return null;
}

/** Turns a domain failure into text the model can relay; unknown failures are not swallowed. */
function explain(error: unknown): string {
    if (error instanceof ToolInputError) return error.message;
    const batch = explainBatch(error);
    if (batch !== null) return batch;
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

function login(ref: { id: string; login: string | null }): string {
    return ref.login ?? ref.id;
}

function presentCard(card: DraftCardView): Record<string, unknown> {
    return {
        number: card.number,
        title: card.title,
        description: card.description,
        deadline: card.deadline?.toISOString() ?? null,
        assignee: card.assignee === null ? null : login(card.assignee),
        creator: login(card.creator),
        onBehalf: card.onBehalf,
        watchers: card.watchers.map(login),
        sourceNote: card.sourceNote,
    };
}

const statusSchema = z
    .string()
    .describe(`Task status: ${TASK_STATUSES.join(', ')} (todo - to do, done - completed)`);
const deadlineSchema = z
    .string()
    .describe('Deadline as ISO 8601 date and time with offset, e.g. 2026-02-01T09:00:00Z');

const proposedItemSchema = z.object({
    title: z.string().describe('Task title, required'),
    description: z.string().optional().describe('Task description'),
    deadline: deadlineSchema.optional(),
    assigneeId: z.string().optional().describe('Assignee user id from find_users'),
    creatorId: z
        .string()
        .optional()
        .describe(
            'Creator (постановщик) user id from find_users, only when the user named another person; by default the creator is the user',
        ),
    watcherIds: z.array(z.string()).optional().describe('Watcher user ids from find_users'),
    sourceNote: z
        .string()
        .optional()
        .describe('Where the task came from, e.g. a quote and a timecode of the meeting'),
});

type ProposedItemArgs = z.infer<typeof proposedItemSchema>;

/**
 * Tools of the tasks agent over the task use cases.
 * The acting user (the initiator) comes only from the run context: no tool accepts it as an
 * argument. The only person the model may name is the creator of a new task, and the rights
 * are still checked for the run user.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- tool() generics are inferred per tool
export function createTaskTools(deps: TaskToolsDeps, ctx: AgentRunContext) {
    const actor = Actor.of(ctx.userId);

    /** Item of propose_tasks; the deadline error names the task by its number. */
    const toItem = (input: ProposedItemArgs, index: number): ProposedItemInput => {
        let deadline: Date | null | undefined;
        try {
            deadline = parseDeadline(input.deadline);
        } catch (error) {
            if (error instanceof ToolInputError) {
                throw new ToolInputError(`Задача ${String(index)}: ${error.message}`);
            }
            throw error;
        }
        return {
            title: input.title,
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(deadline === undefined ? {} : { deadline }),
            ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
            ...(input.creatorId === undefined ? {} : { creatorId: input.creatorId }),
            ...(input.watcherIds === undefined ? {} : { watcherIds: input.watcherIds }),
            ...(input.sourceNote === undefined ? {} : { sourceNote: input.sourceNote }),
        };
    };

    const proposeTasks = tool(
        async (input) => {
            try {
                const items = input.items.map((item, i) => toItem(item, i + 1));
                const { draftId, cards } = await deps.proposeTasks.execute(actor, {
                    threadId: ctx.threadId,
                    items,
                    meetingFileId: input.origin?.fileId ?? null,
                });
                return json({
                    proposed: true,
                    draftId,
                    cards: cards.map(presentCard),
                    message:
                        'Покажи пользователю все карточки с номерами и жди явного подтверждения всего списка. Ничего не создано.',
                });
            } catch (error) {
                return json({ proposed: false, error: explain(error) });
            }
        },
        {
            name: 'propose_tasks',
            description: `Save the list of tasks to confirm (one task is a list of one) and get numbered cards to show the user. Creates nothing. Every new call replaces the previous list of the dialog. Pass only the fields the user named; people are user ids from find_users. creatorId is the creator (постановщик) only when the user explicitly named another person; omit it otherwise. Pass origin only when the list came from the meetings specialist. At most ${String(MAX_DRAFT_TASKS)} tasks.`,
            schema: z.object({
                items: z
                    .array(proposedItemSchema)
                    .describe('Tasks in the order of their numbers on the cards'),
                origin: z
                    .object({
                        fileId: z.string().describe('Id of the meeting recording file'),
                    })
                    .optional()
                    .describe('The meeting the list came from; omit for a list the user typed'),
            }),
        },
    );

    const createTasks = tool(
        async (input) => {
            try {
                const { result, tasks, report } = await deps.createTasksFromDraft.execute(actor, {
                    draftId: input.draftId,
                });
                if (report !== null) {
                    ctx.attachments.add(
                        AttachmentRef.of({
                            fileId: report.id,
                            name: report.name,
                            mediaType: report.mediaType,
                            kind: 'document',
                            sizeBytes: report.sizeBytes,
                        }),
                    );
                }
                return json({
                    created: true,
                    createdCount: result.createdCount,
                    failedCount: result.failedCount,
                    tasks: tasks.map(presentOutcome),
                    report: report === null ? null : { name: report.name },
                });
            } catch (error) {
                return json({ created: false, error: explain(error) });
            }
        },
        {
            name: 'create_tasks',
            description:
                'Create the tasks of a list from propose_tasks, only after the user explicitly confirmed the whole last shown list. Each task is created separately; the answer has the outcome of every task by its number. A list is created once: a repeated call creates nothing.',
            schema: z.object({
                draftId: z.string().describe('draftId returned by the last propose_tasks'),
            }),
        },
    );

    function presentOutcome(view: DraftTaskOutcomeView): Record<string, unknown> {
        const { outcome } = view;
        if (outcome.status === 'failed') {
            return { number: outcome.index, status: 'failed', reason: outcome.reason };
        }
        return {
            number: outcome.index,
            status: 'created',
            title: view.title,
            assignee: view.assignee === null ? null : login(view.assignee),
            creator: login(view.creator),
            onBehalf: view.creator.id !== actor.userId,
            deadline: view.deadline?.toISOString() ?? null,
        };
    }

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

    return { proposeTasks, createTasks, searchTasks, findUsers, updateTask };
}

export type TaskTools = ReturnType<typeof createTaskTools>;
