import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_BUG_TITLE_LENGTH = 200;

export class InvalidBugTitleError extends ArgumentInvalidError {}

/** Заголовок бага: обрезанный, 1-200 символов. */
export class BugTitle {
    private constructor(readonly value: string) {}

    static of(raw: string): BugTitle {
        const value = raw.trim();
        if (value.length === 0) throw new InvalidBugTitleError('Bug title must not be empty');
        if (value.length > MAX_BUG_TITLE_LENGTH) {
            throw new InvalidBugTitleError(
                `Bug title is longer than ${String(MAX_BUG_TITLE_LENGTH)} characters`,
            );
        }
        return new BugTitle(value);
    }
}
