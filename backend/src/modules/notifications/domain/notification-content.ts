import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_NOTIFICATION_TITLE_LENGTH = 200;
export const MAX_NOTIFICATION_BODY_LENGTH = 1000;

export class InvalidNotificationContentError extends ArgumentInvalidError {}

export class NotificationContent {
    private constructor(
        readonly title: string,
        readonly body: string,
    ) {}

    static of(raw: { title: string; body: string }): NotificationContent {
        const title = raw.title.trim();
        const body = raw.body.trim();
        if (title.length === 0) {
            throw new InvalidNotificationContentError('Notification title must not be empty');
        }
        if (title.length > MAX_NOTIFICATION_TITLE_LENGTH) {
            throw new InvalidNotificationContentError(
                `Notification title is longer than ${String(MAX_NOTIFICATION_TITLE_LENGTH)} characters`,
            );
        }
        if (body.length > MAX_NOTIFICATION_BODY_LENGTH) {
            throw new InvalidNotificationContentError(
                `Notification body is longer than ${String(MAX_NOTIFICATION_BODY_LENGTH)} characters`,
            );
        }
        return new NotificationContent(title, body);
    }

    equals(other: NotificationContent): boolean {
        return this.title === other.title && this.body === other.body;
    }
}
