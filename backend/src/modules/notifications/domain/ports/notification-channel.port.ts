import { RetryLaterDeliveryError } from '../../../../shared/outbox/domain/delivery-errors';
import type { Notification } from '../notification';

export class ChannelDeliveryInProgressError extends RetryLaterDeliveryError {
    constructor(channel: string, retryAfterMs: number, metadata?: unknown) {
        super(
            `${channel} delivery is in progress in another handler`,
            retryAfterMs,
            undefined,
            metadata,
        );
    }
}

export abstract class NotificationChannelPort {
    abstract readonly channel: string;

    abstract deliver(notification: Notification, unreadCount: number): Promise<void>;
}
