import { Injectable } from '@nestjs/common';
import { toNotificationDto } from '../application/notification-view';
import {
    NOTIFICATION_CREATED_REALTIME_EVENT,
    UserRealtimeEmitterPort,
} from '../application/ports/user-realtime-emitter.port';
import type { Notification } from '../domain/notification';
import { NotificationChannelPort } from '../domain/ports/notification-channel.port';

export const REALTIME_CHANNEL = 'realtime';

@Injectable()
export class RealtimeChannel extends NotificationChannelPort {
    readonly channel = REALTIME_CHANNEL;

    constructor(private readonly emitter: UserRealtimeEmitterPort) {
        super();
    }

    async deliver(notification: Notification, unreadCount: number): Promise<void> {
        await this.emitter.emitToUser(notification.recipientId, {
            name: NOTIFICATION_CREATED_REALTIME_EVENT,
            payload: { notification: toNotificationDto(notification), unreadCount },
        });
    }
}
