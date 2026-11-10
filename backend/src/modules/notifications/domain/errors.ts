import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const NotificationErrorCode = {
    NotificationNotFound: 'NOTIFICATION_NOT_FOUND',
} as const;

export class NotificationNotFoundError extends BaseError {
    readonly code = NotificationErrorCode.NotificationNotFound;

    constructor(readonly notificationId: string) {
        super(`Notification ${notificationId} not found`);
    }
}

export class InvalidNotificationStateError extends ArgumentInvalidError {}
