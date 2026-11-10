import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { NotificationClockPort } from '../domain/ports/notification-clock.port';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import type { NotificationActor } from './notification-actor';
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

    async execute(actor: NotificationActor): Promise<{ unreadCount: 0 }> {
        await this.notifications.markAllRead(actor.userId, this.clock.now());
        await emitNotificationRead(this.emitter, this.logger, actor.userId, {
            all: true,
            unreadCount: 0,
        });
        return { unreadCount: 0 };
    }
}
