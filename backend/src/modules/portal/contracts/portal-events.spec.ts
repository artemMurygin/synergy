import { describe, expect, it } from 'vitest';
import {
    DomainEventRegistry,
    InvalidEventPayloadError,
} from '../../../shared/outbox/application/domain-event-registry';
import type { DomainEvent } from '../../../shared/ddd';
import { SKILL_STATUSES } from '../domain/skill-status';
import { RequestAcceptedEvent, REQUEST_ACCEPTED_EVENT_TYPE } from './request-accepted.event';
import { RequestTakenEvent, REQUEST_TAKEN_EVENT_TYPE } from './request-taken.event';
import { RequestRejectedEvent, REQUEST_REJECTED_EVENT_TYPE } from './request-rejected.event';
import {
    SKILL_STATUS_CHANGED_EVENT_TYPE,
    SkillStatusChangedEvent,
} from './skill-status-changed.event';
import {
    COMMENT_EXCERPT_LENGTH,
    REQUEST_COMMENT_POSTED_EVENT_TYPE,
    RequestCommentPostedEvent,
    commentExcerpt,
} from './request-comment-posted.event';
import { registerPortalEvents } from './register-portal-events';
import { SKILL_STATUS_LABELS } from './skill-status-labels';

const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'dev' };
const REQUEST_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const SKILL_ID = '9c1d2e3f-0a1b-4c5d-8e6f-7a8b9c0d1e2f';

function registry(): DomainEventRegistry {
    const events = new DomainEventRegistry();
    registerPortalEvents(events);
    return events;
}

function roundTrip(
    events: DomainEventRegistry,
    original:
        | RequestAcceptedEvent
        | RequestRejectedEvent
        | RequestTakenEvent
        | RequestCommentPostedEvent
        | SkillStatusChangedEvent,
): DomainEvent {
    const serialized = events.serialize(original);
    return events.restore({
        id: original.id,
        eventType: serialized.eventType,
        aggregateId: original.aggregateId,
        payload: JSON.parse(JSON.stringify(serialized.payload)),
        metadata: JSON.parse(JSON.stringify(original.metadata)),
    });
}

const accepted = (): RequestAcceptedEvent =>
    new RequestAcceptedEvent({
        aggregateId: REQUEST_ID,
        authorId: 'author',
        decidedBy: 'dev',
        requestTitle: 'Идея',
        skillId: SKILL_ID,
        skillName: 'Разбор писем',
        skillStatus: 'planned',
        metadata,
    });

const rejected = (): RequestRejectedEvent =>
    new RequestRejectedEvent({
        aggregateId: REQUEST_ID,
        authorId: 'author',
        decidedBy: 'dev',
        reason: 'Дубликат',
        requestTitle: 'Разбор писем',
        metadata,
    });

const changed = (): SkillStatusChangedEvent =>
    new SkillStatusChangedEvent({
        aggregateId: SKILL_ID,
        skillName: 'Разбор писем',
        from: 'planned',
        to: 'in_dev',
        changedBy: 'dev',
        linked: [{ requestId: REQUEST_ID, authorId: 'author', title: 'Идея' }],
        metadata,
    });

describe('RequestAccepted contract', () => {
    it('has a stable event type and exposes the request id', () => {
        expect(REQUEST_ACCEPTED_EVENT_TYPE).toBe('portal.request_accepted');
        expect(accepted().requestId).toBe(REQUEST_ID);
    });

    it('serializes and restores an equal event', () => {
        const events = registry();
        const original = accepted();

        expect(events.serialize(original).payload).toEqual({
            authorId: 'author',
            decidedBy: 'dev',
            requestTitle: 'Идея',
            skillId: SKILL_ID,
            skillName: 'Разбор писем',
            skillStatus: 'planned',
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(RequestAcceptedEvent);
        if (!(restored instanceof RequestAcceptedEvent)) return;
        expect(restored.requestId).toBe(REQUEST_ID);
        expect(restored.authorId).toBe('author');
        expect(restored.decidedBy).toBe('dev');
        expect(restored.requestTitle).toBe('Идея');
        expect(restored.skillId).toBe(SKILL_ID);
        expect(restored.skillName).toBe('Разбор писем');
        expect(restored.skillStatus).toBe('planned');
        expect(restored.metadata).toEqual(metadata);
    });

    it.each([
        [
            'an unknown skill status',
            {
                authorId: 'a',
                decidedBy: 'd',
                requestTitle: 't',
                skillId: 's',
                skillName: 'n',
                skillStatus: 'done',
            },
        ],
        [
            'an empty author',
            {
                authorId: '',
                decidedBy: 'd',
                requestTitle: 't',
                skillId: 's',
                skillName: 'n',
                skillStatus: 'planned',
            },
        ],
        [
            'a missing skill name',
            {
                authorId: 'a',
                decidedBy: 'd',
                requestTitle: 't',
                skillId: 's',
                skillStatus: 'planned',
            },
        ],
    ])('rejects a payload with %s', (_case, payload) => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: REQUEST_ACCEPTED_EVENT_TYPE,
                aggregateId: REQUEST_ID,
                payload,
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

const taken = (): RequestTakenEvent =>
    new RequestTakenEvent({
        aggregateId: REQUEST_ID,
        authorId: 'author',
        reviewerId: 'dev',
        requestTitle: 'Идея',
        metadata,
    });

describe('RequestAccepted effortHours', () => {
    it('round-trips effortHours', () => {
        const events = registry();
        const original = new RequestAcceptedEvent({
            aggregateId: REQUEST_ID,
            authorId: 'author',
            decidedBy: 'dev',
            requestTitle: 'Идея',
            skillId: SKILL_ID,
            skillName: 'Разбор писем',
            skillStatus: 'planned',
            effortHours: 16,
            metadata,
        });
        expect(events.serialize(original).payload).toMatchObject({ effortHours: 16 });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(RequestAcceptedEvent);
        if (!(restored instanceof RequestAcceptedEvent)) return;
        expect(restored.effortHours).toBe(16);
    });

    it('parses an old event without effortHours', () => {
        const restored = registry().restore({
            id: 'e1',
            eventType: REQUEST_ACCEPTED_EVENT_TYPE,
            aggregateId: REQUEST_ID,
            payload: {
                authorId: 'a',
                decidedBy: 'd',
                requestTitle: 't',
                skillId: 's',
                skillName: 'n',
                skillStatus: 'planned',
            },
            metadata,
        });
        expect(restored).toBeInstanceOf(RequestAcceptedEvent);
        if (!(restored instanceof RequestAcceptedEvent)) return;
        expect(restored.effortHours).toBeUndefined();
    });
});

describe('RequestTaken contract', () => {
    it('has a stable event type and exposes the request id', () => {
        expect(REQUEST_TAKEN_EVENT_TYPE).toBe('portal.request_taken');
        expect(taken().requestId).toBe(REQUEST_ID);
    });

    it('serializes and restores an equal event', () => {
        const events = registry();
        const original = taken();
        expect(events.serialize(original).payload).toEqual({
            authorId: 'author',
            reviewerId: 'dev',
            requestTitle: 'Идея',
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(RequestTakenEvent);
        if (!(restored instanceof RequestTakenEvent)) return;
        expect(restored.requestId).toBe(REQUEST_ID);
        expect(restored.authorId).toBe('author');
        expect(restored.reviewerId).toBe('dev');
        expect(restored.requestTitle).toBe('Идея');
        expect(restored.metadata).toEqual(metadata);
    });

    it.each([
        ['an empty reviewer', { authorId: 'a', reviewerId: '', requestTitle: 't' }],
        ['a missing title', { authorId: 'a', reviewerId: 'r' }],
    ])('rejects a payload with %s', (_case, payload) => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: REQUEST_TAKEN_EVENT_TYPE,
                aggregateId: REQUEST_ID,
                payload,
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('RequestRejected contract', () => {
    it('has a stable event type and exposes the request id', () => {
        expect(REQUEST_REJECTED_EVENT_TYPE).toBe('portal.request_rejected');
        expect(rejected().requestId).toBe(REQUEST_ID);
    });

    it('serializes and restores an equal event', () => {
        const events = registry();
        const original = rejected();

        expect(events.serialize(original).payload).toEqual({
            authorId: 'author',
            decidedBy: 'dev',
            reason: 'Дубликат',
            requestTitle: 'Разбор писем',
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(RequestRejectedEvent);
        if (!(restored instanceof RequestRejectedEvent)) return;
        expect(restored.requestId).toBe(REQUEST_ID);
        expect(restored.reason).toBe('Дубликат');
        expect(restored.requestTitle).toBe('Разбор писем');
        expect(restored.authorId).toBe('author');
        expect(restored.decidedBy).toBe('dev');
    });

    it.each([
        ['an empty reason', { authorId: 'a', decidedBy: 'd', reason: '', requestTitle: 't' }],
        ['a missing title', { authorId: 'a', decidedBy: 'd', reason: 'r' }],
    ])('rejects a payload with %s', (_case, payload) => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: REQUEST_REJECTED_EVENT_TYPE,
                aggregateId: REQUEST_ID,
                payload,
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('SkillStatusChanged contract', () => {
    it('has a stable event type and exposes the skill id', () => {
        expect(SKILL_STATUS_CHANGED_EVENT_TYPE).toBe('portal.skill_status_changed');
        expect(changed().skillId).toBe(SKILL_ID);
    });

    it('serializes and restores the event with the linked requests snapshot', () => {
        const events = registry();
        const original = changed();

        expect(events.serialize(original).payload).toEqual({
            skillName: 'Разбор писем',
            from: 'planned',
            to: 'in_dev',
            changedBy: 'dev',
            linked: [{ requestId: REQUEST_ID, authorId: 'author', title: 'Идея' }],
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(SkillStatusChangedEvent);
        if (!(restored instanceof SkillStatusChangedEvent)) return;
        expect(restored.skillId).toBe(SKILL_ID);
        expect(restored.from).toBe('planned');
        expect(restored.to).toBe('in_dev');
        expect(restored.changedBy).toBe('dev');
        expect(restored.linked).toEqual([
            { requestId: REQUEST_ID, authorId: 'author', title: 'Идея' },
        ]);
    });

    it('accepts an empty snapshot', () => {
        const restored = registry().restore({
            id: 'e1',
            eventType: SKILL_STATUS_CHANGED_EVENT_TYPE,
            aggregateId: SKILL_ID,
            payload: { skillName: 'n', from: 'planned', to: 'in_dev', changedBy: 'd', linked: [] },
            metadata,
        });
        expect(restored).toBeInstanceOf(SkillStatusChangedEvent);
    });

    it.each([
        [
            'an unknown target status',
            { skillName: 'n', from: 'planned', to: 'x', changedBy: 'd', linked: [] },
        ],
        ['a missing snapshot', { skillName: 'n', from: 'planned', to: 'in_dev', changedBy: 'd' }],
        [
            'a snapshot row without an author',
            {
                skillName: 'n',
                from: 'planned',
                to: 'in_dev',
                changedBy: 'd',
                linked: [{ requestId: 'r', title: 't' }],
            },
        ],
    ])('rejects a payload with %s', (_case, payload) => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: SKILL_STATUS_CHANGED_EVENT_TYPE,
                aggregateId: SKILL_ID,
                payload,
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('registerPortalEvents', () => {
    it('registers all four events so the relay can serialize them with their subscribers', () => {
        const events = registry();
        for (const type of [
            REQUEST_ACCEPTED_EVENT_TYPE,
            REQUEST_REJECTED_EVENT_TYPE,
            REQUEST_TAKEN_EVENT_TYPE,
            SKILL_STATUS_CHANGED_EVENT_TYPE,
        ]) {
            events.subscribe(type, { name: `testing.${type}`, handle: () => Promise.resolve() });
        }

        expect(events.serialize(accepted()).subscribers).toEqual([
            `testing.${REQUEST_ACCEPTED_EVENT_TYPE}`,
        ]);
        expect(events.serialize(rejected()).subscribers).toEqual([
            `testing.${REQUEST_REJECTED_EVENT_TYPE}`,
        ]);
        expect(events.serialize(taken()).subscribers).toEqual([
            `testing.${REQUEST_TAKEN_EVENT_TYPE}`,
        ]);
        expect(events.serialize(changed()).subscribers).toEqual([
            `testing.${SKILL_STATUS_CHANGED_EVENT_TYPE}`,
        ]);
    });
});

describe('SKILL_STATUS_LABELS', () => {
    it('has the Russian label for every skill status', () => {
        expect(SKILL_STATUS_LABELS).toEqual({
            planned: 'Запланировано',
            in_dev: 'В разработке',
            testing: 'Тестируется',
            launched: 'Запущено',
            rework: 'Доработка',
        });
        expect(Object.keys(SKILL_STATUS_LABELS).sort()).toEqual([...SKILL_STATUSES].sort());
    });
});

describe('RequestCommentPosted contract', () => {
    const COMMENT_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const posted = (): RequestCommentPostedEvent =>
        new RequestCommentPostedEvent({
            aggregateId: COMMENT_ID,
            requestId: REQUEST_ID,
            requestAuthorId: 'author',
            commenterId: 'dev',
            requestTitle: 'Идея',
            excerpt: 'Привет',
            metadata,
        });

    it('has a stable event type and aggregate id equal to the comment id', () => {
        expect(REQUEST_COMMENT_POSTED_EVENT_TYPE).toBe('portal.request_comment_posted');
        expect(posted().aggregateId).toBe(COMMENT_ID);
    });

    it('serializes and restores an equal event', () => {
        const events = registry();
        const original = posted();
        expect(events.serialize(original).payload).toEqual({
            requestId: REQUEST_ID,
            requestAuthorId: 'author',
            commenterId: 'dev',
            requestTitle: 'Идея',
            excerpt: 'Привет',
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(RequestCommentPostedEvent);
        if (!(restored instanceof RequestCommentPostedEvent)) return;
        expect(restored.aggregateId).toBe(COMMENT_ID);
        expect(restored.requestId).toBe(REQUEST_ID);
        expect(restored.requestAuthorId).toBe('author');
        expect(restored.commenterId).toBe('dev');
        expect(restored.requestTitle).toBe('Идея');
        expect(restored.excerpt).toBe('Привет');
        expect(restored.metadata).toEqual(metadata);
    });

    it('rejects a payload without an excerpt', () => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: REQUEST_COMMENT_POSTED_EVENT_TYPE,
                aggregateId: COMMENT_ID,
                payload: { requestId: 'r', requestAuthorId: 'a', commenterId: 'c', requestTitle: 't' },
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('commentExcerpt', () => {
    it('returns short text unchanged', () => {
        expect(commentExcerpt('abc')).toBe('abc');
    });

    it('keeps text of exactly the limit unchanged', () => {
        const text = 'a'.repeat(COMMENT_EXCERPT_LENGTH);
        expect(commentExcerpt(text)).toBe(text);
    });

    it('truncates longer text to 199 chars plus an ellipsis', () => {
        const result = commentExcerpt('a'.repeat(COMMENT_EXCERPT_LENGTH + 50));
        expect(result).toBe(`${'a'.repeat(COMMENT_EXCERPT_LENGTH - 1)}…`);
        expect(result).toHaveLength(COMMENT_EXCERPT_LENGTH);
    });
});
