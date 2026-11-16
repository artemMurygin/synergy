import { describe, expect, it } from 'vitest';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
    ChatSystemMessagePostedEvent,
} from '../../assistant/contracts/chat-system-message-posted.event';
import { registerAssistantEvents } from '../../assistant/contracts/register-assistant-events';
import { registerPortalEvents } from '../../portal/contracts/register-portal-events';
import {
    REQUEST_ACCEPTED_EVENT_TYPE,
    RequestAcceptedEvent,
} from '../../portal/contracts/request-accepted.event';
import {
    REQUEST_REJECTED_EVENT_TYPE,
    RequestRejectedEvent,
} from '../../portal/contracts/request-rejected.event';
import {
    REQUEST_TAKEN_EVENT_TYPE,
    RequestTakenEvent,
} from '../../portal/contracts/request-taken.event';
import {
    SKILL_STATUS_CHANGED_EVENT_TYPE,
    SkillStatusChangedEvent,
} from '../../portal/contracts/skill-status-changed.event';
import { registerTaskEvents } from '../../tasks/contracts/register-task-events';
import {
    TASK_CREATED_EVENT_TYPE,
    TaskCreatedEvent,
} from '../../tasks/contracts/task-created.event';
import {
    NOTIFICATION_CREATED_EVENT_TYPE,
    NotificationCreatedEvent,
} from '../domain/events/notification-created.event';
import {
    CHAT_SYSTEM_MESSAGE_SUBSCRIBER,
    ChatSystemMessagePostedSubscriber,
} from './chat-system-message-posted.subscriber';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { NotificationEventSubscriptions } from './notification-event-subscriptions';
import { registerNotificationEvents } from './register-notification-events';
import {
    REQUEST_ACCEPTED_SUBSCRIBER,
    REQUEST_REJECTED_SUBSCRIBER,
    RequestDecidedSubscriber,
} from './request-decided.subscriber';
import {
    REQUEST_COMMENT_POSTED_SUBSCRIBER,
    RequestCommentPostedSubscriber,
} from './request-comment-posted.subscriber';
import { REQUEST_COMMENT_POSTED_EVENT_TYPE } from '../../portal/contracts/request-comment-posted.event';
import { BUG_COMMENT_POSTED_EVENT_TYPE } from '../../portal/contracts/bug-comment-posted.event';
import { BUG_REPORTED_EVENT_TYPE } from '../../portal/contracts/bug-reported.event';
import { BUG_STATUS_CHANGED_EVENT_TYPE } from '../../portal/contracts/bug-status-changed.event';
import {
    BUG_COMMENT_POSTED_SUBSCRIBER,
    BugCommentPostedSubscriber,
} from './bug-comment-posted.subscriber';
import { BUG_REPORTED_SUBSCRIBER, BugReportedSubscriber } from './bug-reported.subscriber';
import {
    BUG_STATUS_CHANGED_SUBSCRIBER,
    BugStatusChangedSubscriber,
} from './bug-status-changed.subscriber';
import { REQUEST_TAKEN_SUBSCRIBER, RequestTakenSubscriber } from './request-taken.subscriber';
import {
    SKILL_STATUS_CHANGED_SUBSCRIBER,
    SkillStatusChangedSubscriber,
} from './skill-status-changed.subscriber';
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

function createNotifications(): CreateNotificationsUseCase {
    const notifications = new InMemoryNotificationRepository();
    const transactions = new SnapshotTransactionRunner([notifications]);
    return new CreateNotificationsUseCase(
        notifications,
        new FixedClock(),
        transactions,
        new RecordingEventPublisher(transactions),
        new RecordingCreationMetrics(),
    );
}

function subscriber(): TaskCreatedSubscriber {
    return new TaskCreatedSubscriber(new FakeUserDirectory(), createNotifications());
}

function requestSubscriber(): RequestDecidedSubscriber {
    return new RequestDecidedSubscriber(new FakeUserDirectory(), createNotifications());
}

function takenSubscriber(): RequestTakenSubscriber {
    return new RequestTakenSubscriber(new FakeUserDirectory(), createNotifications());
}

function commentSubscriber(): RequestCommentPostedSubscriber {
    return new RequestCommentPostedSubscriber(new FakeUserDirectory(), createNotifications());
}

function bugSubscribers(): [
    BugReportedSubscriber,
    BugStatusChangedSubscriber,
    BugCommentPostedSubscriber,
] {
    const users = new FakeUserDirectory();
    const create = createNotifications();
    return [
        new BugReportedSubscriber(users, create),
        new BugStatusChangedSubscriber(users, create),
        new BugCommentPostedSubscriber(users, create),
    ];
}

function skillSubscriber(): SkillStatusChangedSubscriber {
    return new SkillStatusChangedSubscriber(createNotifications());
}

function chatSubscriber(): ChatSystemMessagePostedSubscriber {
    return new ChatSystemMessagePostedSubscriber(createNotifications());
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

        new NotificationEventSubscriptions(
            registry,
            taskCreatedSubscriber,
            chatSubscriber(),
            requestSubscriber(),
            skillSubscriber(),
            takenSubscriber(),
            commentSubscriber(),
            ...bugSubscribers(),
        ).onModuleInit();

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

    it('subscribes to chat.system-message-posted on module init', () => {
        const registry = new DomainEventRegistry();
        registerTaskEvents(registry);
        registerAssistantEvents(registry);
        const chatSystemMessageSubscriber = chatSubscriber();

        new NotificationEventSubscriptions(
            registry,
            subscriber(),
            chatSystemMessageSubscriber,
            requestSubscriber(),
            skillSubscriber(),
            takenSubscriber(),
            commentSubscriber(),
            ...bugSubscribers(),
        ).onModuleInit();

        expect(
            registry.findSubscriber(
                CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
                CHAT_SYSTEM_MESSAGE_SUBSCRIBER,
            ),
        ).toBe(chatSystemMessageSubscriber);
        const posted = new ChatSystemMessagePostedEvent({
            aggregateId: 'chat-1',
            ownerId: 'anna',
            messageId: 1,
            topic: 'meeting-transcript.ready',
            subject: { fileId: 'f-1', fileName: 'встреча.m4a' },
        });
        expect(registry.serialize(posted).subscribers).toEqual([CHAT_SYSTEM_MESSAGE_SUBSCRIBER]);
    });

    it('subscribes to the portal request and skill events on module init', () => {
        const registry = new DomainEventRegistry();
        registerPortalEvents(registry);
        const requests = requestSubscriber();
        const skills = skillSubscriber();
        const taken = takenSubscriber();
        const comments = commentSubscriber();
        const bugs = bugSubscribers();

        new NotificationEventSubscriptions(
            registry,
            subscriber(),
            chatSubscriber(),
            requests,
            skills,
            taken,
            comments,
            ...bugs,
        ).onModuleInit();

        expect(
            registry.findSubscriber(
                REQUEST_COMMENT_POSTED_EVENT_TYPE,
                REQUEST_COMMENT_POSTED_SUBSCRIBER,
            ),
        ).toBe(comments);

        expect(registry.findSubscriber(BUG_REPORTED_EVENT_TYPE, BUG_REPORTED_SUBSCRIBER)).toBe(
            bugs[0],
        );
        expect(
            registry.findSubscriber(BUG_STATUS_CHANGED_EVENT_TYPE, BUG_STATUS_CHANGED_SUBSCRIBER),
        ).toBe(bugs[1]);
        expect(
            registry.findSubscriber(BUG_COMMENT_POSTED_EVENT_TYPE, BUG_COMMENT_POSTED_SUBSCRIBER),
        ).toBe(bugs[2]);

        expect(
            registry.findSubscriber(REQUEST_ACCEPTED_EVENT_TYPE, REQUEST_ACCEPTED_SUBSCRIBER),
        ).toBe(requests);
        expect(
            registry.findSubscriber(REQUEST_REJECTED_EVENT_TYPE, REQUEST_REJECTED_SUBSCRIBER),
        ).toBeDefined();
        expect(
            registry.findSubscriber(
                SKILL_STATUS_CHANGED_EVENT_TYPE,
                SKILL_STATUS_CHANGED_SUBSCRIBER,
            ),
        ).toBe(skills);
        expect(registry.findSubscriber(REQUEST_TAKEN_EVENT_TYPE, REQUEST_TAKEN_SUBSCRIBER)).toBe(
            taken,
        );
        const metadata = { timestamp: 1, correlationId: 'c' };
        expect(
            registry.serialize(
                new RequestTakenEvent({
                    aggregateId: 'r-1',
                    authorId: 'a',
                    reviewerId: 'd',
                    requestTitle: 'З',
                    metadata,
                }),
            ).subscribers,
        ).toEqual([REQUEST_TAKEN_SUBSCRIBER]);
        expect(
            registry.serialize(
                new RequestAcceptedEvent({
                    aggregateId: 'r-1',
                    authorId: 'a',
                    decidedBy: 'd',
                    requestTitle: 'З',
                    skillId: 's',
                    skillName: 'Н',
                    skillStatus: 'planned',
                    metadata,
                }),
            ).subscribers,
        ).toEqual([REQUEST_ACCEPTED_SUBSCRIBER]);
        expect(
            registry.serialize(
                new RequestRejectedEvent({
                    aggregateId: 'r-1',
                    authorId: 'a',
                    decidedBy: 'd',
                    reason: 'П',
                    requestTitle: 'З',
                    metadata,
                }),
            ).subscribers,
        ).toEqual([REQUEST_REJECTED_SUBSCRIBER]);
        expect(
            registry.serialize(
                new SkillStatusChangedEvent({
                    aggregateId: 's-1',
                    skillName: 'Н',
                    from: 'planned',
                    to: 'in_dev',
                    changedBy: 'd',
                    linked: [],
                    metadata,
                }),
            ).subscribers,
        ).toEqual([SKILL_STATUS_CHANGED_SUBSCRIBER]);
    });
});
