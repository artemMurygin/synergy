import {
    BotApiConflictError,
    BotApiRateLimitedError,
    BotApiRejectedError,
    ChatUnavailableError,
    TransientDeliveryError,
} from './errors';
import type { TelegramSendErrorReason } from './ports/telegram-message-metrics.port';

export function sendErrorReasonOf(error: unknown): TelegramSendErrorReason {
    if (error instanceof TransientDeliveryError) return 'transient';
    if (error instanceof BotApiRateLimitedError) return 'rate_limited';
    if (error instanceof ChatUnavailableError) return 'chat_unavailable';
    if (error instanceof BotApiRejectedError || error instanceof BotApiConflictError) {
        return 'permanent';
    }
    return 'unknown';
}
