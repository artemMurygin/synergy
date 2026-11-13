import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_REQUEST_TITLE_LENGTH = 200;

export class InvalidRequestTitleError extends ArgumentInvalidError {}

/** Request title: trimmed, 1-200 characters. */
export class RequestTitle {
    private constructor(readonly value: string) {}

    static of(raw: string): RequestTitle {
        const value = raw.trim();
        if (value.length === 0)
            throw new InvalidRequestTitleError('Request title must not be empty');
        if (value.length > MAX_REQUEST_TITLE_LENGTH) {
            throw new InvalidRequestTitleError(
                `Request title is longer than ${String(MAX_REQUEST_TITLE_LENGTH)} characters`,
            );
        }
        return new RequestTitle(value);
    }

    equals(other: RequestTitle): boolean {
        return this.value === other.value;
    }
}
