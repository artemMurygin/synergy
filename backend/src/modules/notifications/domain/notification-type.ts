import { ArgumentInvalidError } from '../../../shared/errors';

export const NOTIFICATION_TYPES = [
    'task.assigned',
    'task.created-on-behalf',
    'meeting-transcript.ready',
    'meeting-transcript.failed',
    'request.accepted',
    'request.rejected',
    'request.under-review',
    'request.status-changed',
    'request.comment-added',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export class InvalidNotificationTypeError extends ArgumentInvalidError {}

export const NotificationType = {
    parse(raw: string): NotificationType {
        const type = NOTIFICATION_TYPES.find((candidate) => candidate === raw);
        if (type === undefined) {
            throw new InvalidNotificationTypeError(`Unknown notification type: ${raw}`);
        }
        return type;
    },
};
