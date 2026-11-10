import { Injectable } from '@nestjs/common';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import type { NotificationActor } from './notification-actor';
import { toNotificationDto, type NotificationPageView } from './notification-view';

export interface ListNotificationsQuery {
    readonly limit: number;
    readonly page: number;
    readonly unreadOnly: boolean;
}

@Injectable()
export class ListNotificationsUseCase {
    constructor(private readonly notifications: NotificationRepositoryPort) {}

    async execute(
        actor: NotificationActor,
        query: ListNotificationsQuery,
    ): Promise<NotificationPageView> {
        const { items, total } = await this.notifications.findPage(actor.userId, {
            limit: query.limit,
            page: query.page,
            isUnreadOnly: query.unreadOnly,
        });
        return { items: items.map(toNotificationDto), total, limit: query.limit, page: query.page };
    }
}
