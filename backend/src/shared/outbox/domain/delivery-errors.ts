import { ArgumentInvalidError, BaseError } from '../../errors';

export const PERMANENT_DELIVERY_FAILURE = 'OUTBOX.PERMANENT_DELIVERY_FAILURE';
export const RETRY_LATER = 'OUTBOX.RETRY_LATER';

export class PermanentDeliveryError extends BaseError {
    readonly code: string = PERMANENT_DELIVERY_FAILURE;
}

export class RetryLaterDeliveryError extends BaseError {
    readonly code: string = RETRY_LATER;

    constructor(
        message: string,
        readonly retryAfterMs: number,
        cause?: Error,
        metadata?: unknown,
    ) {
        super(message, cause, metadata);
        if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0) {
            throw new ArgumentInvalidError('retryAfterMs must be a non-negative integer');
        }
    }
}
