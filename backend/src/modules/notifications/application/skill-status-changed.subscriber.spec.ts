import { beforeEach, describe, expect, it } from 'vitest';
import type { LinkedRequestSnapshot } from '../../portal/contracts/linked-request-snapshot';
import { SkillStatusChangedEvent } from '../../portal/contracts/skill-status-changed.event';
import { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import {
    SKILL_STATUS_CHANGED_SUBSCRIBER,
    SkillStatusChangedSubscriber,
} from './skill-status-changed.subscriber';
import { UnexpectedSourceEventError } from './task-created.subscriber';
import {
    FixedClock,
    InMemoryNotificationRepository,
    RecordingCreationMetrics,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
} from './test-doubles';

const SKILL_ID = '9c1d2e3f-0a1b-4c5d-8e6f-7a8b9c0d1e2f';
const EVENT_ID = '0c8d7e6f-5a4b-4c3d-9e2f-1a0b9c8d7e6f';

const changed = (
    linked: LinkedRequestSnapshot[] = [
        { requestId: 'req-1', authorId: 'anna-id', title: 'Первая' },
        { requestId: 'req-2', authorId: 'anna-id', title: 'Вторая' },
        { requestId: 'req-3', authorId: 'boris-id', title: 'Третья' },
        { requestId: 'req-4', authorId: 'dev-id', title: 'Своя' },
    ],
): SkillStatusChangedEvent =>
    new SkillStatusChangedEvent({
        id: EVENT_ID,
        aggregateId: SKILL_ID,
        skillName: 'Сверка актов',
        from: 'planned',
        to: 'in_dev',
        changedBy: 'dev-id',
        linked,
        metadata: { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'dev-id' },
    });

describe('SkillStatusChangedSubscriber', () => {
    let notifications: InMemoryNotificationRepository;
    let events: RecordingEventPublisher;
    let subscriber: SkillStatusChangedSubscriber;

    beforeEach(() => {
        notifications = new InMemoryNotificationRepository();
        const transactions = new SnapshotTransactionRunner([notifications]);
        events = new RecordingEventPublisher(transactions);
        subscriber = new SkillStatusChangedSubscriber(
            new CreateNotificationsUseCase(
                notifications,
                new FixedClock(),
                transactions,
                events,
                new RecordingCreationMetrics(),
            ),
        );
    });

    it('is registered under a stable subscriber name', () => {
        expect(SKILL_STATUS_CHANGED_SUBSCRIBER).toBe('notifications.skill-status-changed');
        expect(subscriber.name).toBe(SKILL_STATUS_CHANGED_SUBSCRIBER);
    });

    it('creates one notification per linked request except those of the developer', async () => {
        await subscriber.handle(changed());

        const stored = [...notifications.byId.values()];
        expect(
            stored.map((n) => [n.recipientId, n.type, n.target.type, n.target.id]).sort(),
        ).toEqual([
            ['anna-id', 'request.status-changed', 'request', 'req-1'],
            ['anna-id', 'request.status-changed', 'request', 'req-2'],
            ['boris-id', 'request.status-changed', 'request', 'req-3'],
        ]);
        expect(stored.every((n) => n.sourceEventId === EVENT_ID)).toBe(true);
        expect(events.published).toHaveLength(3);
    });

    it('does not duplicate notifications when the event is handled again', async () => {
        await subscriber.handle(changed());
        await subscriber.handle(changed());

        expect(notifications.byId.size).toBe(3);
        expect(events.published).toHaveLength(3);
    });

    it('creates nothing for an empty snapshot', async () => {
        await subscriber.handle(changed([]));

        expect(notifications.byId.size).toBe(0);
        expect(events.published).toEqual([]);
    });

    it('rejects an event of another type', async () => {
        const unexpected = new NotificationCreatedEvent({ aggregateId: 'n-1', recipientId: 'b' });

        await expect(subscriber.handle(unexpected)).rejects.toBeInstanceOf(
            UnexpectedSourceEventError,
        );
    });
});
