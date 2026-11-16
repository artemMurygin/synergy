import { beforeEach, describe, expect, it } from 'vitest';
import { BugCommentPostedEvent } from '../../portal/contracts/bug-comment-posted.event';
import { BugReportedEvent } from '../../portal/contracts/bug-reported.event';
import { BugStatusChangedEvent } from '../../portal/contracts/bug-status-changed.event';
import { RequestTakenEvent } from '../../portal/contracts/request-taken.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import {
    BUG_COMMENT_POSTED_SUBSCRIBER,
    BugCommentPostedSubscriber,
} from './bug-comment-posted.subscriber';
import { BUG_REPORTED_SUBSCRIBER, BugReportedSubscriber } from './bug-reported.subscriber';
import {
    BUG_STATUS_CHANGED_SUBSCRIBER,
    BugStatusChangedSubscriber,
} from './bug-status-changed.subscriber';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';
import {
    FakeUserDirectory,
    FixedClock,
    InMemoryNotificationRepository,
    RecordingCreationMetrics,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

const EVENT_ID = '0c8d7e6f-5a4b-4c3d-9e2f-1a0b9c8d7e6f';
const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };

const reported = (authorId: string): BugReportedEvent =>
    new BugReportedEvent({
        id: EVENT_ID,
        aggregateId: 'bug-1',
        bugId: 'bug-1',
        authorId,
        title: 'Падает выгрузка',
        productName: 'Аудит',
        agentName: 'Сверка',
        metadata,
    });

const statusChanged = (changedBy: string): BugStatusChangedEvent =>
    new BugStatusChangedEvent({
        id: EVENT_ID,
        aggregateId: 'bug-1',
        bugId: 'bug-1',
        authorId: 'anna-id',
        changedBy,
        title: 'Падает выгрузка',
        from: 'open',
        to: 'resolved',
        reason: null,
        metadata,
    });

const commented = (commenterId: string): BugCommentPostedEvent =>
    new BugCommentPostedEvent({
        id: EVENT_ID,
        aggregateId: 'comment-1',
        bugId: 'bug-1',
        bugAuthorId: 'anna-id',
        commenterId,
        bugTitle: 'Падает выгрузка',
        excerpt: 'Нужны уточнения',
        metadata,
    });

describe('bug subscribers', () => {
    let notifications: InMemoryNotificationRepository;
    let users: FakeUserDirectory;
    let reportedSub: BugReportedSubscriber;
    let statusSub: BugStatusChangedSubscriber;
    let commentSub: BugCommentPostedSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        users = new FakeUserDirectory();
        users.fullNameById.set('dev-1', 'Петров Пётр');
        users.fullNameById.set('anna-id', 'Анна Иванова');
        users.developerIds = ['dev-1', 'dev-2'];
        const transactions = new SnapshotTransactionRunner([notifications]);
        const create = new CreateNotificationsUseCase(
            notifications,
            new FixedClock(),
            transactions,
            new RecordingEventPublisher(transactions),
            new RecordingCreationMetrics(),
        );
        reportedSub = new BugReportedSubscriber(users, create);
        statusSub = new BugStatusChangedSubscriber(users, create);
        commentSub = new BugCommentPostedSubscriber(users, create);
    });

    it('has stable names', () => {
        expect(reportedSub.name).toBe(BUG_REPORTED_SUBSCRIBER);
        expect(BUG_REPORTED_SUBSCRIBER).toBe('notifications.bug-reported');
        expect(statusSub.name).toBe(BUG_STATUS_CHANGED_SUBSCRIBER);
        expect(BUG_STATUS_CHANGED_SUBSCRIBER).toBe('notifications.bug-status-changed');
        expect(commentSub.name).toBe(BUG_COMMENT_POSTED_SUBSCRIBER);
        expect(BUG_COMMENT_POSTED_SUBSCRIBER).toBe('notifications.bug-comment-posted');
    });

    it('reported: notifies developers without the author', async () => {
        await reportedSub.handle(reported('anna-id'));

        const stored = [...notifications.byId.values()];
        expect(stored.map((n) => n.recipientId).sort()).toEqual(['dev-1', 'dev-2']);
        expect(stored[0].type).toBe('bug.reported');
        expect(stored[0].content.body).toBe('Анна Иванова · Аудит · Сверка');
        expect(stored[0].sourceEventId).toBe(EVENT_ID);
    });

    it('reported: empty recipient list is success', async () => {
        users.developerIds = ['anna-id'];

        await expect(reportedSub.handle(reported('anna-id'))).resolves.toBeUndefined();

        expect(notifications.byId.size).toBe(0);
    });

    it('reported: does not duplicate on reprocessing', async () => {
        await reportedSub.handle(reported('anna-id'));
        await reportedSub.handle(reported('anna-id'));

        expect(notifications.byId.size).toBe(2);
    });

    it('reported: unknown author fails', async () => {
        await expect(reportedSub.handle(reported('ghost-id'))).rejects.toBeInstanceOf(
            NotificationActorNotFoundError,
        );
    });

    it('status-changed: notifies the author without loading developers', async () => {
        await statusSub.handle(statusChanged('dev-1'));

        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        expect(stored[0].recipientId).toBe('anna-id');
        expect(stored[0].type).toBe('bug.status-changed');
        expect(stored[0].content.body).toBe('Петров Пётр сменил статус');
        expect(users.developersRequested).toBe(0);
    });

    it('status-changed: own change is success without notifications', async () => {
        users.fullNameById.set('anna-id', 'Анна Иванова');

        await expect(statusSub.handle(statusChanged('anna-id'))).resolves.toBeUndefined();

        expect(notifications.byId.size).toBe(0);
    });

    it('status-changed: does not duplicate on reprocessing', async () => {
        await statusSub.handle(statusChanged('dev-1'));
        await statusSub.handle(statusChanged('dev-1'));

        expect(notifications.byId.size).toBe(1);
    });

    it('status-changed: unknown actor fails', async () => {
        await expect(statusSub.handle(statusChanged('ghost-id'))).rejects.toBeInstanceOf(
            NotificationActorNotFoundError,
        );
    });

    it('comment: developer comment goes to the author, no developers loaded', async () => {
        await commentSub.handle(commented('dev-1'));

        const stored = [...notifications.byId.values()];
        expect(stored).toHaveLength(1);
        expect(stored[0].recipientId).toBe('anna-id');
        expect(stored[0].type).toBe('bug.comment-added');
        expect(stored[0].content.body).toBe('Петров Пётр: Нужны уточнения');
        expect(users.developersRequested).toBe(0);
    });

    it('comment: author comment goes to developers; reprocessing does not duplicate', async () => {
        await commentSub.handle(commented('anna-id'));
        await commentSub.handle(commented('anna-id'));

        expect(users.developersRequested).toBe(2);
        expect([...notifications.byId.values()].map((n) => n.recipientId).sort()).toEqual([
            'dev-1',
            'dev-2',
        ]);
    });

    it('comment: no other developers is success', async () => {
        users.developerIds = ['anna-id'];

        await expect(commentSub.handle(commented('anna-id'))).resolves.toBeUndefined();

        expect(notifications.byId.size).toBe(0);
    });

    it('comment: unknown commenter fails', async () => {
        await expect(commentSub.handle(commented('ghost-id'))).rejects.toBeInstanceOf(
            NotificationActorNotFoundError,
        );
    });

    it('rejects a foreign event', async () => {
        const foreign = new RequestTakenEvent({
            aggregateId: 'r-1',
            authorId: 'anna-id',
            reviewerId: 'dev-1',
            requestTitle: 'З',
            metadata,
        });

        for (const sub of [reportedSub, statusSub, commentSub]) {
            await expect(sub.handle(foreign)).rejects.toBeInstanceOf(UnexpectedSourceEventError);
        }
    });
});
