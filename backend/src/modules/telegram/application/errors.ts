import { BaseError } from '../../../shared/errors';

export const TelegramDeliveryErrorCode = {
    Transient: 'TELEGRAM_TRANSIENT_DELIVERY_FAILURE',
    ChatUnavailable: 'TELEGRAM_CHAT_UNAVAILABLE',
} as const;

export class TransientDeliveryError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.Transient;
}

export class ChatUnavailableError extends BaseError {
    readonly code = TelegramDeliveryErrorCode.ChatUnavailable;
}
