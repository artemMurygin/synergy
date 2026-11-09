import { ArgumentInvalidError } from '../../../shared/errors';

export class InvalidActorError extends ArgumentInvalidError {}

/** Subject of an action; the input of TaskAccessPolicy. */
export class Actor {
    private constructor(readonly userId: string) {
        Object.freeze(this);
    }

    static of(userId: string): Actor {
        if (userId.trim() === '') throw new InvalidActorError('Actor user id must not be empty');
        return new Actor(userId);
    }
}
