import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_COMMENT_LENGTH = 4000;

/** Текст комментария: обрезанный по краям, 1-4000 символов; разметка не трогается. */
export class CommentBody {
    private constructor(readonly value: string) {}

    static of(raw: string): CommentBody {
        const value = raw.trim();
        if (value.length === 0) {
            throw new ArgumentInvalidError('Comment body must not be empty');
        }
        if (value.length > MAX_COMMENT_LENGTH) {
            throw new ArgumentInvalidError(
                `Comment body is longer than ${String(MAX_COMMENT_LENGTH)} characters`,
            );
        }
        return new CommentBody(value);
    }
}
