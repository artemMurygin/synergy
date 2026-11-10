import type { Notification } from '../notification';

export interface NotificationPageQuery {
    readonly limit: number;
    readonly page: number;
    readonly isUnreadOnly: boolean;
}

export interface NotificationPage {
    readonly items: Notification[];
    readonly total: number;
}

export type MarkReadResult = 'marked' | 'already-read' | 'not-found';

export abstract class NotificationRepositoryPort {
    abstract insertIgnoringDuplicates(
        notifications: readonly Notification[],
    ): Promise<Notification[]>;

    abstract findById(id: string): Promise<Notification | null>;

    abstract findPage(recipientId: string, query: NotificationPageQuery): Promise<NotificationPage>;

    abstract countUnread(recipientId: string): Promise<number>;

    abstract markRead(id: string, recipientId: string, now: Date): Promise<MarkReadResult>;

    abstract markAllRead(recipientId: string, now: Date): Promise<void>;
}
