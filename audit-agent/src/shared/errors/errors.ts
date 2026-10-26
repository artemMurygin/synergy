import { BaseError } from './base.error';
import {
    ARGUMENT_INVALID,
    ARGUMENT_NOT_PROVIDED,
    ARGUMENT_OUT_OF_RANGE,
    CONFLICT,
    INTERNAL_ERROR,
    NOT_FOUND,
} from './error-codes';

export class ArgumentInvalidError extends BaseError {
    readonly code: string = ARGUMENT_INVALID;
}

export class ArgumentNotProvidedError extends BaseError {
    readonly code: string = ARGUMENT_NOT_PROVIDED;
}

export class ArgumentOutOfRangeError extends BaseError {
    readonly code: string = ARGUMENT_OUT_OF_RANGE;
}

export class ConflictError extends BaseError {
    readonly code: string = CONFLICT;
}

export class NotFoundError extends BaseError {
    static readonly DEFAULT_MESSAGE = 'Not found';

    readonly code: string = NOT_FOUND;

    constructor(message: string = NotFoundError.DEFAULT_MESSAGE) {
        super(message);
    }
}

export class InternalError extends BaseError {
    static readonly DEFAULT_MESSAGE = 'Internal server error';

    readonly code: string = INTERNAL_ERROR;

    constructor(message: string = InternalError.DEFAULT_MESSAGE) {
        super(message);
    }
}
