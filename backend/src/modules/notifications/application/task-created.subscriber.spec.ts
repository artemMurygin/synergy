import { beforeEach, describe, expect, it } from 'vitest';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import {
    TASK_ASSIGNED_ON_CREATE_SUBSCRIBER,
    TaskCreatedSubscriber,
    UnexpectedSourceEventError,
} from './task-created.subscriber';
import {
    FakeUserDirectory,
    FixedClock,
    InMemoryNotificationRepository,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

const TASK_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const EVENT_ID = '0c8d7e6f-5a4b-4c3d-9e2f-1a0b9c8d7e6f';

function taskCreated(assigneeId: string | null, creatorId = 'ivanov-id'): TaskCreatedEvent {
    return new TaskCreatedEvent({
        id: EVENT_ID,
        aggregateId: TASK_ID,
        title: 'Подготовить КП',
        creatorId,
        assigneeId,
        metadata: { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: creatorId },
    });
}

describe('TaskCreatedSubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let users: FakeUserDirectory;
    let events: RecordingEventPublisher;
    let subscriber: TaskCreatedSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        users = new FakeUserDirectory();
        users.loginById.set('ivanov-id', 'ivanov');
        const transactions = new SnapshotTransactionRunner([notifications]);
        events = new RecordingEventPublisher(transactions);
        subscriber = new TaskCreatedSubscriber(
            users,
            new CreateNotificationsUseCase(notifications, new FixedClock(), transactions, events),
        );
    });

    it('is registered under a stable subscriber name', () => {
        expect(TASK_ASSIGNED_ON_CREATE_SUBSCRIBER).toBe('notifications.task-assigned-on-create');
        expect(subscriber.name).toBe(TASK_ASSIGNED_ON_CREATE_SUBSCRIBER);
    });

    it('creates the task.assigned notification with the login of the creator', async () => {
        await subscriber.handle(taskCreated('petrova-id'));

        expect(users.requestedIds).toEqual(['ivanov-id']);
        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        const [notification] = stored;
        expect(notification.recipientId).toBe('petrova-id');
        expect(notification.type).toBe('task.assigned');
        expect(notification.content.title).toBe('Вам назначена задача');
        expect(notification.content.body).toBe('От ivanov: Подготовить КП');
        expect(notification.target.id).toBe(TASK_ID);
        expect(notification.actorId).toBe('ivanov-id');
        expect(notification.sourceEventId).toBe(EVENT_ID);
        expect(events.published).toHaveLength(1);
        expect(events.published[0]).toBeInstanceOf(NotificationCreatedEvent);
    });

    it('creates nothing for a task assigned to its creator', async () => {
        await subscriber.handle(taskCreated('ivanov-id'));

        expect(users.requestedIds).toEqual([]);
        expect(notifications.byId.size).toBe(0);
        expect(events.published).toEqual([]);
    });

    it('creates nothing for a task without an assignee', async () => {
        await subscriber.handle(taskCreated(null));

        expect(users.requestedIds).toEqual([]);
        expect(notifications.byId.size).toBe(0);
        expect(events.published).toEqual([]);
    });

    it('does not duplicate the notification when the event is handled again', async () => {
        await subscriber.handle(taskCreated('petrova-id'));
        await subscriber.handle(taskCreated('petrova-id'));

        expect(notifications.byId.size).toBe(1);
        expect(events.published).toHaveLength(1);
    });

    it('rethrows a user directory failure so that the outbox retries the delivery', async () => {
        const failure = new Error('database is unavailable');
        users.failure = failure;

        await expect(subscriber.handle(taskCreated('petrova-id'))).rejects.toBe(failure);
        expect(notifications.byId.size).toBe(0);
    });

    it('fails when the creator is unknown to the user directory', async () => {
        await expect(
            subscriber.handle(taskCreated('petrova-id', 'missing-id')),
        ).rejects.toBeInstanceOf(NotificationActorNotFoundError);
        expect(notifications.byId.size).toBe(0);
    });

    it('does not fail on an unknown creator when no notification is needed', async () => {
        await subscriber.handle(taskCreated(null, 'missing-id'));
        await subscriber.handle(taskCreated('missing-id', 'missing-id'));

        expect(users.requestedIds).toEqual([]);
        expect(notifications.byId.size).toBe(0);
    });

    it('rejects an event of another type', async () => {
        const unexpected = new NotificationCreatedEvent({
            aggregateId: 'n-1',
            recipientId: 'boris',
        });

        await expect(subscriber.handle(unexpected)).rejects.toBeInstanceOf(
            UnexpectedSourceEventError,
        );
    });
});
