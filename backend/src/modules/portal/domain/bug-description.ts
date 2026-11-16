import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_BUG_DESCRIPTION_LENGTH = 4000;

export class InvalidBugDescriptionError extends ArgumentInvalidError {}

/** Описание бага: обрезается по краям, переносы внутри сохраняются, 1-4000 символов. */
export class BugDescription {
    private constructor(readonly value: string) {}

    static of(raw: string): BugDescription {
        const value = raw.trim();
        if (value.length === 0) {
            throw new InvalidBugDescriptionError('Bug description must not be empty');
        }
        if (value.length > MAX_BUG_DESCRIPTION_LENGTH) {
            throw new InvalidBugDescriptionError(
                `Bug description is longer than ${String(MAX_BUG_DESCRIPTION_LENGTH)} characters`,
            );
        }
        return new BugDescription(value);
    }
}
