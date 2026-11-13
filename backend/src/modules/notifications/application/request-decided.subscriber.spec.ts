import { beforeEach, describe, expect, it } from 'vitest';
import { RequestAcceptedEvent } from '../../portal/contracts/request-accepted.event';
import { RequestRejectedEvent } from '../../portal/contracts/request-rejected.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import {
    REQUEST_ACCEPTED_SUBSCRIBER,
    REQUEST_REJECTED_SUBSCRIBER,
    RequestDecidedSubscriber,
} from './request-decided.subscriber';
import { UnexpectedSourceEventError } from './task-created.subscriber';
import {
    FakeUserDirectory,
    FixedClock,
    InMemoryNotificationRepository,
    RecordingCreationMetrics,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

const REQUEST_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const EVENT_ID = '0c8d7e6f-5a4b-4c3d-9e2f-1a0b9c8d7e6f';
const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'dev-id' };

const accepted = (authorId = 'anna-id'): RequestAcceptedEvent =>
    new RequestAcceptedEvent({
        id: EVENT_ID,
        aggregateId: REQUEST_ID,
        authorId,
        decidedBy: 'dev-id',
        requestTitle: 'Сверка актов',
        skillId: 'skill-1',
        skillName: 'Сверка актов',
        skillStatus: 'planned',
        metadata,
    });

const rejected = (authorId = 'anna-id'): RequestRejectedEvent =>
    new RequestRejectedEvent({
        id: EVENT_ID,
        aggregateId: REQUEST_ID,
        authorId,
        decidedBy: 'dev-id',
        reason: 'Уже есть в поставке',
        requestTitle: 'Сверка актов',
        metadata,
    });

describe('RequestDecidedSubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let users: FakeUserDirectory;
    let events: RecordingEventPublisher;
    let subscriber: RequestDecidedSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        users = new FakeUserDirectory();
        users.loginById.set('dev-id', 'petrov');
        const transactions = new SnapshotTransactionRunner([notifications]);
        events = new RecordingEventPublisher(transactions);
        subscriber = new RequestDecidedSubscriber(
            users,
            new CreateNotificationsUseCase(
                notifications,
                new FixedClock(),
                transactions,
                events,
                new RecordingCreationMetrics(),
            ),
        );
    });

    it('is registered under stable subscriber names, one per event type', () => {
        expect(REQUEST_ACCEPTED_SUBSCRIBER).toBe('notifications.request-accepted');
        expect(REQUEST_REJECTED_SUBSCRIBER).toBe('notifications.request-rejected');
        expect(subscriber.name).toBe(REQUEST_ACCEPTED_SUBSCRIBER);
        expect(subscriber.rejections().name).toBe(REQUEST_REJECTED_SUBSCRIBER);
    });

    it('creates request.accepted for the author with the login of the developer', async () => {
        await subscriber.handle(accepted());

        expect(users.requestedIds).toEqual(['dev-id']);
        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        const [notification] = stored;
        expect(notification.recipientId).toBe('anna-id');
        expect(notification.type).toBe('request.accepted');
        expect(notification.content.body).toContain('petrov');
        expect(notification.target.type).toBe('request');
        expect(notification.target.id).toBe(REQUEST_ID);
        expect(notification.actorId).toBe('dev-id');
        expect(notification.sourceEventId).toBe(EVENT_ID);
        expect(events.published).toHaveLength(1);
    });

    it('creates request.rejected with the reason through the rejection subscriber', async () => {
        await subscriber.rejections().handle(rejected());

        const [notification] = [...notifications.byId.values()];
        expect(notification.type).toBe('request.rejected');
        expect(notification.content.body).toContain('Уже есть в поставке');
    });

    it('creates nothing when the author is the developer, without a directory lookup', async () => {
        await subscriber.handle(accepted('dev-id'));
        await subscriber.handle(rejected('dev-id'));

        expect(users.requestedIds).toEqual([]);
        expect(notifications.byId.size).toBe(0);
        expect(events.published).toEqual([]);
    });

    it('does not duplicate the notification when the event is handled again', async () => {
        await subscriber.handle(accepted());
        await subscriber.handle(accepted());

        expect(notifications.byId.size).toBe(1);
        expect(events.published).toHaveLength(1);
    });

    it('rethrows a user directory failure so that the outbox retries the delivery', async () => {
        const failure = new Error('database is unavailable');
        users.failure = failure;

        await expect(subscriber.handle(accepted())).rejects.toBe(failure);
        expect(notifications.byId.size).toBe(0);
    });

    it('fails when the developer is unknown to the user directory', async () => {
        users.loginById.clear();

        await expect(subscriber.handle(accepted())).rejects.toBeInstanceOf(
            NotificationActorNotFoundError,
        );
    });

    it('rejects an event of another type', async () => {
        const unexpected = new NotificationCreatedEvent({ aggregateId: 'n-1', recipientId: 'b' });

        await expect(subscriber.handle(unexpected)).rejects.toBeInstanceOf(
            UnexpectedSourceEventError,
        );
    });
});
