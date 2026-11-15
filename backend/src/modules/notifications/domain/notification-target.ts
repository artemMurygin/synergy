import { ArgumentInvalidError } from '../../../shared/errors';

export const NOTIFICATION_TARGET_TYPES = ['task', 'chat', 'request', 'bug'] as const;

export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

export class InvalidNotificationTargetError extends ArgumentInvalidError {}

export class NotificationTarget {
    private constructor(
        readonly type: NotificationTargetType,
        readonly id: string,
    ) {}

    static of(raw: { type: string; id: string }): NotificationTarget {
        const type = NOTIFICATION_TARGET_TYPES.find((candidate) => candidate === raw.type);
        if (type === undefined) {
            throw new InvalidNotificationTargetError(
                `Unknown notification target type: ${raw.type}`,
            );
        }
        const id = raw.id.trim();
        if (id.length === 0) {
            throw new InvalidNotificationTargetError('Notification target id must not be empty');
        }
        return new NotificationTarget(type, id);
    }

    equals(other: NotificationTarget): boolean {
        return this.key() === other.key();
    }

    private key(): string {
        return `${this.type}:${this.id}`;
    }
}
