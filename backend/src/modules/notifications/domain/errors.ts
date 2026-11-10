import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const NotificationErrorCode = {
    NotificationNotFound: 'NOTIFICATION_NOT_FOUND',
    NotificationActorNotFound: 'NOTIFICATION_ACTOR_NOT_FOUND',
} as const;

export class NotificationNotFoundError extends BaseError {
    readonly code = NotificationErrorCode.NotificationNotFound;

    constructor(readonly notificationId: string) {
        super(`Notification ${notificationId} not found`);
    }
}

export class NotificationActorNotFoundError extends BaseError {
    readonly code = NotificationErrorCode.NotificationActorNotFound;

    constructor(readonly actorId: string) {
        super(`Notification actor ${actorId} not found`);
    }
}

export class InvalidNotificationStateError extends ArgumentInvalidError {}
