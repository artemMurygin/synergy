import { ArgumentInvalidError } from '../../../shared/errors';
import { TaskStatus } from './task-status';

export class InvalidTaskFilterError extends ArgumentInvalidError {}

export interface TaskFilterInput {
    status?: string;
    creatorId?: string;
    assigneeId?: string;
    watcherId?: string;
    overdue?: boolean;
    titleContains?: string;
}

/** Immutable set of list conditions, combined with AND. */
export class TaskFilter {
    private constructor(
        readonly status: TaskStatus | undefined,
        readonly creatorId: string | undefined,
        readonly assigneeId: string | undefined,
        readonly watcherId: string | undefined,
        readonly overdue: boolean | undefined,
        readonly titleContains: string | undefined,
    ) {
        Object.freeze(this);
    }

    static of(input: TaskFilterInput): TaskFilter {
        const titleContains = input.titleContains?.trim();
        return new TaskFilter(
            input.status === undefined ? undefined : parseStatus(input.status),
            input.creatorId,
            input.assigneeId,
            input.watcherId,
            input.overdue,
            titleContains === undefined || titleContains === '' ? undefined : titleContains,
        );
    }
}

function parseStatus(raw: string): TaskStatus {
    try {
        return TaskStatus.parse(raw);
    } catch (error) {
        throw new InvalidTaskFilterError(`Unknown status filter: ${raw}`, error as Error);
    }
}
