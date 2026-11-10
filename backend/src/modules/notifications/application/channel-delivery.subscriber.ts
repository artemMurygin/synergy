import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import {
    ChannelDeliveryInProgressError,
    type NotificationChannelPort,
} from '../domain/ports/notification-channel.port';
import type { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import type { NotificationChannelMetricsPort } from './ports/notification-channel-metrics.port';
import { UnexpectedSourceEventError } from './task-created.subscriber';

const CHANNEL_SUBSCRIBER_PREFIX = 'notifications.channel.';

export function channelSubscriberName(channel: string): string {
    return `${CHANNEL_SUBSCRIBER_PREFIX}${channel}`;
}

export class ChannelDeliverySubscriber implements EventSubscriber {
    readonly name: string;

    readonly isTransactional = false;

    constructor(
        private readonly channel: NotificationChannelPort,
        private readonly notifications: NotificationRepositoryPort,
        private readonly metrics: NotificationChannelMetricsPort,
    ) {
        this.name = channelSubscriberName(channel.channel);
    }

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof NotificationCreatedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects NotificationCreatedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        const notification = await this.notifications.findById(event.notificationId);
        if (notification === null) return;
        const unreadCount = await this.notifications.countUnread(notification.recipientId);
        try {
            await this.channel.deliver(notification, unreadCount);
        } catch (error: unknown) {
            if (!(error instanceof ChannelDeliveryInProgressError)) {
                this.metrics.recordFailure(this.channel.channel);
            }
            throw error;
        }
    }
}
