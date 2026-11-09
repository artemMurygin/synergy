import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_TASK_TITLE_LENGTH = 200;

export class InvalidTaskTitleError extends ArgumentInvalidError {}

/** Task title: trimmed, 1-200 characters. */
export class TaskTitle {
    private constructor(readonly value: string) {}

    static of(raw: string): TaskTitle {
        const value = raw.trim();
        if (value.length === 0) throw new InvalidTaskTitleError('Task title must not be empty');
        if (value.length > MAX_TASK_TITLE_LENGTH) {
            throw new InvalidTaskTitleError(
                `Task title is longer than ${String(MAX_TASK_TITLE_LENGTH)} characters`,
            );
        }
        return new TaskTitle(value);
    }

    equals(other: TaskTitle): boolean {
        return this.value === other.value;
    }
}
