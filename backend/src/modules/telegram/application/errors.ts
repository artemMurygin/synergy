import { BaseError } from '../../../shared/errors';

export const TelegramDeliveryErrorCode = {
    Transient: 'TELEGRAM_TRANSIENT_DELIVERY_FAILURE',
    ChatUnavailable: 'TELEGRAM_CHAT_UNAVAILABLE',
    RateLimited: 'TELEGRAM_RATE_LIMITED',
    Rejected: 'TELEGRAM_REQUEST_REJECTED',
    Conflict: 'TELEGRAM_UPDATES_CONFLICT',
} as const;

export const TelegramRequestErrorCode = {
    RateLimited: 'RATE_LIMITED',
} as const;

export class TransientDeliveryError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.Transient;
}

export class ChatUnavailableError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.ChatUnavailable;
}

export class BotApiRateLimitedError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.RateLimited;

    constructor(
        message: string,
        readonly retryAfterMs: number | null,
        cause?: Error,
        metadata?: unknown,
    ) {
        super(message, cause, metadata);
    }
}

export class BotApiRejectedError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.Rejected;
}

export class BotApiConflictError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.Conflict;
}

export class LinkTokenRateLimitedError extends BaseError {
    readonly code = TelegramRequestErrorCode.RateLimited;

    constructor(readonly retryAfterSeconds: number) {
        super('Too many link requests, try again later');
    }
}
