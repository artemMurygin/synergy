import type { Notification } from '../domain/notification';
import type { NotificationTargetType } from '../domain/notification-target';
import type { NotificationType } from '../domain/notification-type';

export interface NotificationDto {
    readonly id: string;
    readonly type: NotificationType;
    readonly title: string;
    readonly body: string;
    readonly target: { readonly type: NotificationTargetType; readonly id: string };
    readonly actorId: string | null;
    readonly createdAt: string;
    readonly readAt: string | null;
}

export interface NotificationPageView {
    readonly items: NotificationDto[];
    readonly total: number;
    readonly limit: number;
    readonly page: number;
}

export interface UnreadCountView {
    readonly unreadCount: number;
}

export function toNotificationDto(notification: Notification): NotificationDto {
    return {
        id: notification.id,
        type: notification.type,
        title: notification.content.title,
        body: notification.content.body,
        target: { type: notification.target.type, id: notification.target.id },
        actorId: notification.actorId,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
    };
}
