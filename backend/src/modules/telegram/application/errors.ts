import { BaseError } from '../../../shared/errors';

export const TelegramDeliveryErrorCode = {
    Transient: 'TELEGRAM_TRANSIENT_DELIVERY_FAILURE',
    ChatUnavailable: 'TELEGRAM_CHAT_UNAVAILABLE',
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

export class LinkTokenRateLimitedError extends BaseError {
    readonly code = TelegramRequestErrorCode.RateLimited;

    constructor(readonly retryAfterSeconds: number) {
        super('Too many link requests, try again later');
    }
}
