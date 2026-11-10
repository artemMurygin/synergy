import { Injectable } from '@nestjs/common';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import type { NotificationActor } from './notification-actor';
import type { UnreadCountView } from './notification-view';

@Injectable()
export class GetUnreadCountUseCase {
    constructor(private readonly notifications: NotificationRepositoryPort) {}

    async execute(actor: NotificationActor): Promise<UnreadCountView> {
        return { unreadCount: await this.notifications.countUnread(actor.userId) };
    }
}
