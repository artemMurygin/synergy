import { ArgumentInvalidError } from '../../../shared/errors';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export class InvalidTaskStatusError extends ArgumentInvalidError {}

export const TaskStatus = {
    parse(raw: string): TaskStatus {
        const status = TASK_STATUSES.find((candidate) => candidate === raw);
        if (status === undefined) {
            throw new InvalidTaskStatusError(`Unknown task status: ${raw}`);
        }
        return status;
    },
};
