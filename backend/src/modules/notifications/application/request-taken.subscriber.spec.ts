import { beforeEach, describe, expect, it } from 'vitest';
import { RequestAcceptedEvent } from '../../portal/contracts/request-accepted.event';
import { RequestTakenEvent } from '../../portal/contracts/request-taken.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { REQUEST_TAKEN_SUBSCRIBER, RequestTakenSubscriber } from './request-taken.subscriber';
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

const taken = (authorId = 'anna-id', reviewerId = 'dev-id'): RequestTakenEvent =>
    new RequestTakenEvent({
        id: EVENT_ID,
        aggregateId: REQUEST_ID,
        authorId,
        reviewerId,
        requestTitle: 'Сверка актов',
        metadata,
    });

describe('RequestTakenSubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let users: FakeUserDirectory;
    let subscriber: RequestTakenSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        users = new FakeUserDirectory();
        users.fullNameById.set('dev-id', 'Петров Пётр');
        const transactions = new SnapshotTransactionRunner([notifications]);
        subscriber = new RequestTakenSubscriber(
            users,
            new CreateNotificationsUseCase(
                notifications,
                new FixedClock(),
                transactions,
                new RecordingEventPublisher(transactions),
                new RecordingCreationMetrics(),
            ),
        );
    });

    it('has a stable subscriber name', () => {
        expect(REQUEST_TAKEN_SUBSCRIBER).toBe('notifications.request-taken');
        expect(subscriber.name).toBe(REQUEST_TAKEN_SUBSCRIBER);
    });

    it('creates request.under-review for the author with the full name of the reviewer', async () => {
        await subscriber.handle(taken());

        expect(users.requestedIds).toEqual(['dev-id']);
        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        expect(stored[0].recipientId).toBe('anna-id');
        expect(stored[0].type).toBe('request.under-review');
        expect(stored[0].content.body).toContain('Петров Пётр');
        expect(stored[0].actorId).toBe('dev-id');
        expect(stored[0].sourceEventId).toBe(EVENT_ID);
    });

    it('does not duplicate the notification on reprocessing', async () => {
        await subscriber.handle(taken());
        await subscriber.handle(taken());

        expect(notifications.byId.size).toBe(1);
    });

    it('creates nothing when the author took their own request', async () => {
        await subscriber.handle(taken('dev-id', 'dev-id'));

        expect(notifications.byId.size).toBe(0);
    });

    it('fails when the reviewer is unknown', async () => {
        await expect(subscriber.handle(taken('anna-id', 'ghost-id'))).rejects.toBeInstanceOf(
            NotificationActorNotFoundError,
        );
        expect(notifications.byId.size).toBe(0);
    });

    it('rejects a foreign event', async () => {
        const foreign = new RequestAcceptedEvent({
            aggregateId: REQUEST_ID,
            authorId: 'anna-id',
            decidedBy: 'dev-id',
            requestTitle: 'З',
            skillId: 's',
            skillName: 'Н',
            skillStatus: 'planned',
            metadata,
        });

        await expect(subscriber.handle(foreign)).rejects.toBeInstanceOf(UnexpectedSourceEventError);
    });
});
