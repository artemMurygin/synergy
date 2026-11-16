import { beforeEach, describe, expect, it } from 'vitest';
import { RequestCommentPostedEvent } from '../../portal/contracts/request-comment-posted.event';
import { RequestTakenEvent } from '../../portal/contracts/request-taken.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import {
    REQUEST_COMMENT_POSTED_SUBSCRIBER,
    RequestCommentPostedSubscriber,
} from './request-comment-posted.subscriber';
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
const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };

const posted = (commenterId: string, requestAuthorId = 'anna-id'): RequestCommentPostedEvent =>
    new RequestCommentPostedEvent({
        id: EVENT_ID,
        aggregateId: 'comment-1',
        requestId: REQUEST_ID,
        requestAuthorId,
        commenterId,
        requestTitle: 'Сверка актов',
        excerpt: 'Нужны уточнения',
        metadata,
    });

describe('RequestCommentPostedSubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let users: FakeUserDirectory;
    let subscriber: RequestCommentPostedSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        users = new FakeUserDirectory();
        users.fullNameById.set('dev-1', 'Петров Пётр');
        users.fullNameById.set('anna-id', 'Анна Иванова');
        users.developerIds = ['dev-1', 'dev-2'];
        const transactions = new SnapshotTransactionRunner([notifications]);
        subscriber = new RequestCommentPostedSubscriber(
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
        expect(REQUEST_COMMENT_POSTED_SUBSCRIBER).toBe('notifications.request-comment-posted');
        expect(subscriber.name).toBe(REQUEST_COMMENT_POSTED_SUBSCRIBER);
    });

    it('notifies the author about a developer comment without loading developers', async () => {
        await subscriber.handle(posted('dev-1'));

        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        expect(stored[0].recipientId).toBe('anna-id');
        expect(stored[0].type).toBe('request.comment-added');
        expect(stored[0].content.body).toBe('Петров Пётр: Нужны уточнения');
        expect(stored[0].actorId).toBe('dev-1');
        expect(stored[0].sourceEventId).toBe(EVENT_ID);
        expect(users.developersRequested).toBe(0);
    });

    it('notifies every active developer when the author comments', async () => {
        await subscriber.handle(posted('anna-id'));

        expect(users.developersRequested).toBe(1);
        const recipients = [...notifications.byId.values()].map((n) => n.recipientId).sort();
        expect(recipients).toEqual(['dev-1', 'dev-2']);
    });

    it('treats an empty recipient list as success without creating notifications', async () => {
        users.developerIds = ['dev-1'];
        users.fullNameById.set('dev-1', 'Петров Пётр');

        await expect(subscriber.handle(posted('dev-1', 'dev-1'))).resolves.toBeUndefined();

        expect(notifications.byId.size).toBe(0);
    });

    it('does not duplicate notifications on reprocessing', async () => {
        await subscriber.handle(posted('anna-id'));
        await subscriber.handle(posted('anna-id'));

        expect(notifications.byId.size).toBe(2);
    });

    it('fails when the commenter is unknown', async () => {
        await expect(subscriber.handle(posted('ghost-id'))).rejects.toBeInstanceOf(
            NotificationActorNotFoundError,
        );
        expect(notifications.byId.size).toBe(0);
    });

    it('rejects a foreign event', async () => {
        const foreign = new RequestTakenEvent({
            aggregateId: REQUEST_ID,
            authorId: 'anna-id',
            reviewerId: 'dev-1',
            requestTitle: 'З',
            metadata,
        });

        await expect(subscriber.handle(foreign)).rejects.toBeInstanceOf(UnexpectedSourceEventError);
    });
});
