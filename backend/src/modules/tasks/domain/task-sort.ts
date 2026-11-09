import { ArgumentInvalidError } from '../../../shared/errors';

export const TASK_SORT_FIELDS = ['deadline', 'createdAt', 'updatedAt'] as const;
export const TASK_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
export type TaskSortDirection = (typeof TASK_SORT_DIRECTIONS)[number];

export class InvalidTaskSortError extends ArgumentInvalidError {}

export interface TaskSortInput {
    field?: string;
    direction?: string;
}

/** List ordering restricted to a whitelist of fields; default is newest first. */
export class TaskSort {
    private constructor(
        readonly field: TaskSortField,
        readonly direction: TaskSortDirection,
    ) {
        Object.freeze(this);
    }

    static of(input: TaskSortInput): TaskSort {
        const field =
            input.field === undefined
                ? 'createdAt'
                : TASK_SORT_FIELDS.find((candidate) => candidate === input.field);
        if (field === undefined) {
            throw new InvalidTaskSortError(`Unknown sort field: ${String(input.field)}`);
        }
        const direction =
            input.direction === undefined
                ? 'desc'
                : TASK_SORT_DIRECTIONS.find((candidate) => candidate === input.direction);
        if (direction === undefined) {
            throw new InvalidTaskSortError(`Unknown sort direction: ${String(input.direction)}`);
        }
        return new TaskSort(field, direction);
    }

    static default(): TaskSort {
        return new TaskSort('createdAt', 'desc');
    }
}
