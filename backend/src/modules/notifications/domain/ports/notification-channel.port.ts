import type { Notification } from '../notification';

export abstract class NotificationChannelPort {
    abstract readonly channel: string;

    abstract deliver(notification: Notification, unreadCount: number): Promise<void>;
}
