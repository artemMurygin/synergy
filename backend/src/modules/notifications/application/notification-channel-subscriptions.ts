import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import { NOTIFICATION_CREATED_EVENT_TYPE } from '../domain/events/notification-created.event';
import { NotificationChannelPort } from '../domain/ports/notification-channel.port';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import { ChannelDeliverySubscriber } from './channel-delivery.subscriber';
import { NOTIFICATION_CHANNELS } from './notification-channels.token';
import { NotificationChannelMetricsPort } from './ports/notification-channel-metrics.port';

@Injectable()
export class NotificationChannelSubscriptions implements OnModuleInit {
    constructor(
        private readonly registry: DomainEventRegistry,
        @Inject(NOTIFICATION_CHANNELS)
        private readonly channels: readonly NotificationChannelPort[],
        private readonly notifications: NotificationRepositoryPort,
        private readonly metrics: NotificationChannelMetricsPort,
    ) {}

    onModuleInit(): void {
        for (const channel of this.channels) {
            this.registry.subscribe(
                NOTIFICATION_CREATED_EVENT_TYPE,
                new ChannelDeliverySubscriber(channel, this.notifications, this.metrics),
            );
        }
    }
}
