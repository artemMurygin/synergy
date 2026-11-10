import { ArgumentInvalidError } from '../../../shared/errors';

export const NOTIFICATION_TYPES = ['task.assigned'] as const;

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
