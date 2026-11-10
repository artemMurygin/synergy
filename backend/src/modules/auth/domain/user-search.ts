import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_USER_SEARCH_LENGTH = 200;

export class InvalidUserSearchError extends ArgumentInvalidError {}

/** Login substring to look for: trimmed, at most 200 characters, `null` when empty. */
export class UserSearch {
    private constructor(readonly text: string | null) {
        Object.freeze(this);
    }

    static of(raw: string | undefined): UserSearch {
        const text = raw?.trim() ?? '';
        if (text.length > MAX_USER_SEARCH_LENGTH) {
            throw new InvalidUserSearchError(
                `Search is longer than ${String(MAX_USER_SEARCH_LENGTH)} characters`,
            );
        }
        return new UserSearch(text === '' ? null : text);
    }

    /** `%text%` with LIKE wildcards escaped by a backslash, so the text is matched literally. */
    get likePattern(): string | null {
        if (this.text === null) return null;
        return `%${this.text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    }
}
