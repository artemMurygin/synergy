import { ArgumentInvalidError, BaseError } from '../../../shared/errors';
import type { TaskBatchDraftStatus } from './task-batch-draft';

/** Наибольшее число задач, которое создаётся одним подтверждением. */
export const MAX_DRAFT_TASKS = 30;

export const TaskBatchErrorCode = {
    DraftNotFound: 'TASK_DRAFT_NOT_FOUND',
    DraftAlreadyUsed: 'TASK_DRAFT_ALREADY_USED',
    TooManyTasks: 'TASK_DRAFT_TOO_MANY_TASKS',
    EmptyBatch: 'TASK_DRAFT_EMPTY',
    UnknownUser: 'TASK_DRAFT_UNKNOWN_USER',
    InvalidItem: 'TASK_DRAFT_INVALID_ITEM',
} as const;

export class InvalidTaskBatchError extends ArgumentInvalidError {}

export class DraftNotFoundError extends BaseError {
    readonly code = TaskBatchErrorCode.DraftNotFound;

    constructor(readonly draftId: string) {
        super(`Task draft ${draftId} not found`);
    }
}

/** Черновик уже израсходован (`consumed`) или заменён новым (`superseded`). */
export class DraftAlreadyUsedError extends BaseError {
    readonly code = TaskBatchErrorCode.DraftAlreadyUsed;

    constructor(
        readonly draftId: string,
        readonly status: Exclude<TaskBatchDraftStatus, 'draft'>,
    ) {
        super(`Task draft ${draftId} is already ${status}`);
    }
}

export class TooManyDraftTasksError extends InvalidTaskBatchError {
    override readonly code: string = TaskBatchErrorCode.TooManyTasks;

    constructor(readonly count: number) {
        super(
            `A task list cannot have more than ${String(MAX_DRAFT_TASKS)} tasks, got ${String(count)}`,
        );
    }
}

export class EmptyTaskBatchError extends InvalidTaskBatchError {
    override readonly code: string = TaskBatchErrorCode.EmptyBatch;

    constructor() {
        super('A task list must have at least one task');
    }
}

export type DraftUserField = 'assignee' | 'creator' | 'watcher';

/** Пользователь задачи с номером `index` (с 1) не найден или отключён. */
export class UnknownDraftUserError extends BaseError {
    readonly code = TaskBatchErrorCode.UnknownUser;

    constructor(
        readonly index: number,
        readonly field: DraftUserField,
        readonly userId: string,
    ) {
        super(`Task ${String(index)}: the ${field} does not exist or is inactive`);
    }
}

/** Данные задачи с номером `index` (с 1) не прошли проверку. */
export class InvalidDraftItemError extends InvalidTaskBatchError {
    override readonly code: string = TaskBatchErrorCode.InvalidItem;

    constructor(
        readonly index: number,
        reason: string,
    ) {
        super(`Task ${String(index)}: ${reason}`);
    }
}

export function assertBatchSize(count: number): void {
    if (count === 0) throw new EmptyTaskBatchError();
    if (count > MAX_DRAFT_TASKS) throw new TooManyDraftTasksError(count);
}
