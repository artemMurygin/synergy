import type { PinoLogger } from 'nestjs-pino';
import {
    NOTIFICATION_READ_REALTIME_EVENT,
    type NotificationReadScope,
    type UserRealtimeEmitterPort,
} from './ports/user-realtime-emitter.port';

export async function emitNotificationRead(
    emitter: UserRealtimeEmitterPort,
    logger: PinoLogger,
    userId: string,
    payload: NotificationReadScope & { readonly unreadCount: number },
): Promise<void> {
    try {
        await emitter.emitToUser(userId, { name: NOTIFICATION_READ_REALTIME_EVENT, payload });
    } catch (error: unknown) {
        logger.warn({ err: error, userId }, 'Notification read sync was not sent');
    }
}
