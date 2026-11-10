import type { NotificationDto } from '../notification-view';

export const NOTIFICATION_CREATED_REALTIME_EVENT = 'notification.created';
export const NOTIFICATION_READ_REALTIME_EVENT = 'notification.read';

export interface NotificationCreatedRealtimeEvent {
    readonly name: typeof NOTIFICATION_CREATED_REALTIME_EVENT;
    readonly payload: { readonly notification: NotificationDto; readonly unreadCount: number };
}

export type NotificationReadScope =
    { readonly notificationIds: readonly string[] } | { readonly all: true };

export interface NotificationReadRealtimeEvent {
    readonly name: typeof NOTIFICATION_READ_REALTIME_EVENT;
    readonly payload: NotificationReadScope & { readonly unreadCount: number };
}

export type RealtimeEvent = NotificationCreatedRealtimeEvent | NotificationReadRealtimeEvent;

export abstract class UserRealtimeEmitterPort {
    abstract emitToUser(userId: string, event: RealtimeEvent): Promise<void>;
}
