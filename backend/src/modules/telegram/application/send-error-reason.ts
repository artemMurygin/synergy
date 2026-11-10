import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../shared/outbox/domain/delivery-errors';
import { ChatUnavailableError, TransientDeliveryError } from './errors';
import type { TelegramSendErrorReason } from './ports/telegram-message-metrics.port';

export function sendErrorReasonOf(error: unknown): TelegramSendErrorReason {
    if (error instanceof TransientDeliveryError) return 'transient';
    if (error instanceof RetryLaterDeliveryError) return 'rate_limited';
    if (error instanceof ChatUnavailableError) return 'chat_unavailable';
    if (error instanceof PermanentDeliveryError) return 'permanent';
    return 'unknown';
}
