import type { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    REQUEST_ACCEPTED_EVENT_TYPE,
    RequestAcceptedEvent,
    requestAcceptedPayloadSchema,
    type RequestAcceptedPayload,
} from './request-accepted.event';
import {
    REQUEST_COMMENT_POSTED_EVENT_TYPE,
    RequestCommentPostedEvent,
    requestCommentPostedPayloadSchema,
    type RequestCommentPostedPayload,
} from './request-comment-posted.event';
import {
    REQUEST_REJECTED_EVENT_TYPE,
    RequestRejectedEvent,
    requestRejectedPayloadSchema,
    type RequestRejectedPayload,
} from './request-rejected.event';
import {
    REQUEST_TAKEN_EVENT_TYPE,
    RequestTakenEvent,
    requestTakenPayloadSchema,
    type RequestTakenPayload,
} from './request-taken.event';
import {
    SKILL_STATUS_CHANGED_EVENT_TYPE,
    SkillStatusChangedEvent,
    skillStatusChangedPayloadSchema,
    type SkillStatusChangedPayload,
} from './skill-status-changed.event';

export function registerPortalEvents(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: REQUEST_ACCEPTED_EVENT_TYPE,
        eventClass: RequestAcceptedEvent,
        schema: requestAcceptedPayloadSchema,
        toPayload: (event): RequestAcceptedPayload => ({
            authorId: event.authorId,
            decidedBy: event.decidedBy,
            requestTitle: event.requestTitle,
            skillId: event.skillId,
            skillName: event.skillName,
            skillStatus: event.skillStatus,
            ...(event.effortHours === undefined ? {} : { effortHours: event.effortHours }),
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new RequestAcceptedEvent({ id, aggregateId, metadata, ...payload }),
    });
    registry.registerEvent({
        eventType: REQUEST_REJECTED_EVENT_TYPE,
        eventClass: RequestRejectedEvent,
        schema: requestRejectedPayloadSchema,
        toPayload: (event): RequestRejectedPayload => ({
            authorId: event.authorId,
            decidedBy: event.decidedBy,
            reason: event.reason,
            requestTitle: event.requestTitle,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new RequestRejectedEvent({ id, aggregateId, metadata, ...payload }),
    });
    registry.registerEvent({
        eventType: REQUEST_TAKEN_EVENT_TYPE,
        eventClass: RequestTakenEvent,
        schema: requestTakenPayloadSchema,
        toPayload: (event): RequestTakenPayload => ({
            authorId: event.authorId,
            reviewerId: event.reviewerId,
            requestTitle: event.requestTitle,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new RequestTakenEvent({ id, aggregateId, metadata, ...payload }),
    });
    registry.registerEvent({
        eventType: REQUEST_COMMENT_POSTED_EVENT_TYPE,
        eventClass: RequestCommentPostedEvent,
        schema: requestCommentPostedPayloadSchema,
        toPayload: (event): RequestCommentPostedPayload => ({
            requestId: event.requestId,
            requestAuthorId: event.requestAuthorId,
            commenterId: event.commenterId,
            requestTitle: event.requestTitle,
            excerpt: event.excerpt,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new RequestCommentPostedEvent({ id, aggregateId, metadata, ...payload }),
    });
    registry.registerEvent({
        eventType: SKILL_STATUS_CHANGED_EVENT_TYPE,
        eventClass: SkillStatusChangedEvent,
        schema: skillStatusChangedPayloadSchema,
        toPayload: (event): SkillStatusChangedPayload => ({
            skillName: event.skillName,
            from: event.from,
            to: event.to,
            changedBy: event.changedBy,
            linked: event.linked.map((row) => ({ ...row })),
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new SkillStatusChangedEvent({ id, aggregateId, metadata, ...payload }),
    });
}
