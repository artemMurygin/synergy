import { describe, expect, it } from 'vitest';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import { registerTaskEvents } from '../../tasks/contracts/register-task-events';
import {
    TASK_CREATED_EVENT_TYPE,
    TaskCreatedEvent,
} from '../../tasks/contracts/task-created.event';
import {
    NOTIFICATION_CREATED_EVENT_TYPE,
    NotificationCreatedEvent,
} from '../domain/events/notification-created.event';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { NotificationEventSubscriptions } from './notification-event-subscriptions';
import { registerNotificationEvents } from './register-notification-events';
import {
    TASK_ASSIGNED_ON_CREATE_SUBSCRIBER,
    TaskCreatedSubscriber,
} from './task-created.subscriber';
import {
    FakeUserDirectory,
    FixedClock,
    InMemoryNotificationRepository,
    RecordingCreationMetrics,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

function subscriber(): TaskCreatedSubscriber {
    const notifications = new InMemoryNotificationRepository();
    const transactions = new SnapshotTransactionRunner([notifications]);
    return new TaskCreatedSubscriber(
        new FakeUserDirectory(),
        new CreateNotificationsUseCase(
            notifications,
            new FixedClock(),
            transactions,
            new RecordingEventPublisher(transactions),
            new RecordingCreationMetrics(),
        ),
    );
}

describe('registerNotificationEvents', () => {
    it('serializes and restores NotificationCreatedEvent', () => {
        const registry = new DomainEventRegistry();
        registerNotificationEvents(registry);
        const original = new NotificationCreatedEvent({
            aggregateId: 'n-1',
            recipientId: 'boris',
            metadata: { timestamp: 1_700_000_000_000, correlationId: 'c-1', causationId: 'e-1' },
        });

        const serialized = registry.serialize(original);
        const restored = registry.restore({
            id: original.id,
            eventType: serialized.eventType,
            aggregateId: original.aggregateId,
            payload: JSON.parse(JSON.stringify(serialized.payload)),
            metadata: JSON.parse(JSON.stringify(original.metadata)),
        });

        expect(serialized.eventType).toBe(NOTIFICATION_CREATED_EVENT_TYPE);
        expect(serialized.payload).toEqual({ recipientId: 'boris' });
        expect(restored).toBeInstanceOf(NotificationCreatedEvent);
        if (!(restored instanceof NotificationCreatedEvent)) return;
        expect(restored.id).toBe(original.id);
        expect(restored.notificationId).toBe('n-1');
        expect(restored.recipientId).toBe('boris');
        expect(restored.metadata).toEqual(original.metadata);
    });
});

describe('NotificationEventSubscriptions', () => {
    it('registers notifications.notification_created and subscribes to tasks.task_created on module init', () => {
        const registry = new DomainEventRegistry();
        registerTaskEvents(registry);
        const taskCreatedSubscriber = subscriber();

        new NotificationEventSubscriptions(registry, taskCreatedSubscriber).onModuleInit();

        expect(
            registry.findSubscriber(TASK_CREATED_EVENT_TYPE, TASK_ASSIGNED_ON_CREATE_SUBSCRIBER),
        ).toBe(taskCreatedSubscriber);
        const taskEvent = new TaskCreatedEvent({
            aggregateId: 't-1',
            title: 'КП',
            creatorId: 'anna',
            assigneeId: 'boris',
        });
        expect(registry.serialize(taskEvent).subscribers).toEqual([
            TASK_ASSIGNED_ON_CREATE_SUBSCRIBER,
        ]);
        expect(
            registry.serialize(
                new NotificationCreatedEvent({ aggregateId: 'n-1', recipientId: 'b' }),
            ).eventType,
        ).toBe(NOTIFICATION_CREATED_EVENT_TYPE);
    });
});
