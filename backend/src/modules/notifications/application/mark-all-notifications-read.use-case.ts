import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { NotificationClockPort } from '../domain/ports/notification-clock.port';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import type { NotificationActor } from './notification-actor';
import type { UnreadCountView } from './notification-view';
import { UserRealtimeEmitterPort } from './ports/user-realtime-emitter.port';
import { emitNotificationRead } from './read-sync-emitter';

@Injectable()
export class MarkAllNotificationsReadUseCase {
    constructor(
        private readonly notifications: NotificationRepositoryPort,
        private readonly clock: NotificationClockPort,
        private readonly emitter: UserRealtimeEmitterPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(MarkAllNotificationsReadUseCase.name);
    }

    async execute(actor: NotificationActor): Promise<UnreadCountView> {
        await this.notifications.markAllRead(actor.userId, this.clock.now());
        const unreadCount = await this.notifications.countUnread(actor.userId);
        await emitNotificationRead(this.emitter, this.logger, actor.userId, {
            all: true,
            unreadCount,
        });
        return { unreadCount };
    }
}
