import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import { OutboxRelay } from '../../../shared/outbox/infrastructure/outbox-relay';
import { OutboxSettings } from '../../../shared/outbox/infrastructure/outbox-settings';
import {
    FakeOutboxClock,
    InMemoryOutboxStore,
    RecordingOutboxMetrics,
} from '../../../shared/outbox/testing/in-memory-outbox-store';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import type { Notification } from '../domain/notification';
import { NotificationChannelPort } from '../domain/ports/notification-channel.port';
import { ChannelDeliverySubscriber, channelSubscriberName } from './channel-delivery.subscriber';
import { NotificationChannelSubscriptions } from './notification-channel-subscriptions';
import { NotificationChannelMetricsPort } from './ports/notification-channel-metrics.port';
import { registerNotificationEvents } from './register-notification-events';
import { InMemoryNotificationRepository, makeNotification } from './test-doubles';

class FakeChannel extends NotificationChannelPort {
    readonly deliveries: { notificationId: string; unreadCount: number }[] = [];

    failuresLeft = 0;

    constructor(readonly channel: string) {
        super();
    }

    deliver(notification: Notification, unreadCount: number): Promise<void> {
        this.deliveries.push({ notificationId: notification.id, unreadCount });
        if (this.failuresLeft > 0) {
            this.failuresLeft -= 1;
            return Promise.reject(new Error(`${this.channel} failed`));
        }
        return Promise.resolve();
    }
}

class RecordingChannelMetrics extends NotificationChannelMetricsPort {
    readonly failures: string[] = [];

    recordFailure(channel: string): void {
        this.failures.push(channel);
    }
}

function createdEvent(notification: Notification): NotificationCreatedEvent {
    return new NotificationCreatedEvent({
        aggregateId: notification.id,
        recipientId: notification.recipientId,
    });
}

describe('ChannelDeliverySubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let metrics: RecordingChannelMetrics;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        metrics = new RecordingChannelMetrics();
    });

    it('is named after its channel', () => {
        const subscriber = new ChannelDeliverySubscriber(
            new FakeChannel('telegram'),
            notifications,
            metrics,
        );

        expect(subscriber.name).toBe('notifications.channel.telegram');
        expect(channelSubscriberName('realtime')).toBe('notifications.channel.realtime');
    });

    it('loads the notification and the unread count and hands them to the channel', async () => {
        const channel = new FakeChannel('realtime');
        const first = makeNotification({ recipientId: 'boris' });
        const second = makeNotification({ recipientId: 'boris' });
        await notifications.insertIgnoringDuplicates([
            first,
            second,
            makeNotification({ recipientId: 'anna' }),
        ]);

        await new ChannelDeliverySubscriber(channel, notifications, metrics).handle(
            createdEvent(second),
        );

        expect(channel.deliveries).toEqual([{ notificationId: second.id, unreadCount: 2 }]);
        expect(metrics.failures).toEqual([]);
    });

    it('does nothing when the notification no longer exists', async () => {
        const channel = new FakeChannel('realtime');

        await new ChannelDeliverySubscriber(channel, notifications, metrics).handle(
            createdEvent(makeNotification()),
        );

        expect(channel.deliveries).toEqual([]);
    });

    it('counts a channel failure and lets it through for a retry', async () => {
        const channel = new FakeChannel('realtime');
        channel.failuresLeft = 1;
        const notification = makeNotification();
        await notifications.insertIgnoringDuplicates([notification]);

        await expect(
            new ChannelDeliverySubscriber(channel, notifications, metrics).handle(
                createdEvent(notification),
            ),
        ).rejects.toThrow('realtime failed');
        expect(metrics.failures).toEqual(['realtime']);
    });

    it('rejects an event of another type', async () => {
        const subscriber = new ChannelDeliverySubscriber(
            new FakeChannel('realtime'),
            notifications,
            metrics,
        );

        await expect(
            subscriber.handle(
                new TaskCreatedEvent({
                    aggregateId: 't-1',
                    title: 'КП',
                    creatorId: 'anna',
                    assigneeId: 'boris',
                }),
            ),
        ).rejects.toMatchObject({ code: 'NOTIFICATIONS.UNEXPECTED_SOURCE_EVENT' });
    });
});

describe('NotificationChannelSubscriptions', () => {
    const START = new Date('2026-05-01T10:00:00Z');
    const settings = new OutboxSettings({
        pollIntervalMs: 1000,
        batchSize: 10,
        maxAttempts: 5,
        retentionDays: 7,
    });

    it('subscribes one outbox subscriber per channel and retries only the failing one', async () => {
        const clock = new FakeOutboxClock(START);
        const store = new InMemoryOutboxStore(clock);
        const registry = new DomainEventRegistry();
        registerNotificationEvents(registry);
        const notifications = new InMemoryNotificationRepository();
        const metrics = new RecordingChannelMetrics();
        const realtime = new FakeChannel('realtime');
        const telegram = new FakeChannel('telegram');
        telegram.failuresLeft = 1;
        new NotificationChannelSubscriptions(
            registry,
            [realtime, telegram],
            notifications,
            metrics,
        ).onModuleInit();
        const notification = makeNotification({ recipientId: 'boris' });
        await notifications.insertIgnoringDuplicates([notification]);
        const event = createdEvent(notification);
        const serialized = registry.serialize(event);
        store.addEvent(
            {
                id: event.id,
                eventType: serialized.eventType,
                aggregateId: event.aggregateId,
                payload: serialized.payload,
                metadata: event.metadata,
            },
            serialized.subscribers,
        );
        const relay = new OutboxRelay(
            store,
            registry,
            new InMemoryTransactionRunner(),
            settings,
            clock,
            new RecordingOutboxMetrics(),
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );

        await relay.processBatch();
        clock.advance(60_000);
        await relay.processBatch();

        expect(serialized.subscribers).toEqual([
            'notifications.channel.realtime',
            'notifications.channel.telegram',
        ]);
        expect(realtime.deliveries).toHaveLength(1);
        expect(telegram.deliveries).toHaveLength(2);
        expect(store.delivery(event.id, 'notifications.channel.realtime')).toMatchObject({
            status: 'done',
            attempts: 1,
        });
        expect(store.delivery(event.id, 'notifications.channel.telegram')).toMatchObject({
            status: 'done',
            attempts: 2,
        });
        expect(metrics.failures).toEqual(['telegram']);
    });
});
