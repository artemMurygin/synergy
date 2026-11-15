import { describe, expect, it } from 'vitest';
import {
    DomainEventRegistry,
    InvalidEventPayloadError,
} from '../../../shared/outbox/application/domain-event-registry';
import type { DomainEvent } from '../../../shared/ddd';
import { BUG_COMMENT_POSTED_EVENT_TYPE, BugCommentPostedEvent } from './bug-comment-posted.event';
import { BUG_REPORTED_EVENT_TYPE, BugReportedEvent } from './bug-reported.event';
import { BUG_STATUS_CHANGED_EVENT_TYPE, BugStatusChangedEvent } from './bug-status-changed.event';
import { BUG_STATUS_LABELS } from './bug-status-labels';
import { BUG_STATUSES } from '../domain/bug-status';
import { COMMENT_EXCERPT_LENGTH, commentExcerpt } from './request-comment-posted.event';
import { registerPortalEvents } from './register-portal-events';

const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };
const BUG_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const COMMENT_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function registry(): DomainEventRegistry {
    const events = new DomainEventRegistry();
    registerPortalEvents(events);
    return events;
}

function roundTrip(events: DomainEventRegistry, original: DomainEvent): DomainEvent {
    const serialized = events.serialize(original);
    return events.restore({
        id: original.id,
        eventType: serialized.eventType,
        aggregateId: original.aggregateId,
        payload: JSON.parse(JSON.stringify(serialized.payload)),
        metadata: JSON.parse(JSON.stringify(original.metadata)),
    });
}

describe('BugReported contract', () => {
    const reported = (): BugReportedEvent =>
        new BugReportedEvent({
            aggregateId: BUG_ID,
            bugId: BUG_ID,
            authorId: 'author',
            title: 'Падает',
            productName: 'Продукт',
            agentName: 'Агент',
            metadata,
        });

    it('has a stable type', () => {
        expect(BUG_REPORTED_EVENT_TYPE).toBe('portal.bug_reported');
    });

    it('serializes the payload and restores an equal event', () => {
        const events = registry();
        const original = reported();
        expect(events.serialize(original).payload).toEqual({
            bugId: BUG_ID,
            authorId: 'author',
            title: 'Падает',
            productName: 'Продукт',
            agentName: 'Агент',
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(BugReportedEvent);
        if (!(restored instanceof BugReportedEvent)) return;
        expect(restored.bugId).toBe(BUG_ID);
        expect(restored.agentName).toBe('Агент');
        expect(restored.metadata).toEqual(metadata);
    });

    it('rejects a payload without productName', () => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: BUG_REPORTED_EVENT_TYPE,
                aggregateId: BUG_ID,
                payload: { bugId: BUG_ID, authorId: 'a', title: 't', agentName: 'x' },
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('BugStatusChanged contract', () => {
    const changed = (reason: string | null = null): BugStatusChangedEvent =>
        new BugStatusChangedEvent({
            aggregateId: BUG_ID,
            bugId: BUG_ID,
            authorId: 'author',
            changedBy: 'dev',
            title: 'Падает',
            from: 'open',
            to: 'wont_fix',
            reason,
            metadata,
        });

    it('has a stable type', () => {
        expect(BUG_STATUS_CHANGED_EVENT_TYPE).toBe('portal.bug_status_changed');
    });

    it.each([null, 'Так задумано'])('round-trips with reason %s', (reason) => {
        const events = registry();
        const original = changed(reason);
        expect(events.serialize(original).payload).toEqual({
            bugId: BUG_ID,
            authorId: 'author',
            changedBy: 'dev',
            title: 'Падает',
            from: 'open',
            to: 'wont_fix',
            reason,
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(BugStatusChangedEvent);
        if (!(restored instanceof BugStatusChangedEvent)) return;
        expect(restored.from).toBe('open');
        expect(restored.to).toBe('wont_fix');
        expect(restored.reason).toBe(reason);
    });

    it('rejects an unknown status', () => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: BUG_STATUS_CHANGED_EVENT_TYPE,
                aggregateId: BUG_ID,
                payload: {
                    bugId: BUG_ID,
                    authorId: 'a',
                    changedBy: 'd',
                    title: 't',
                    from: 'open',
                    to: 'bogus',
                    reason: null,
                },
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('BugCommentPosted contract', () => {
    const posted = (excerpt = 'Привет'): BugCommentPostedEvent =>
        new BugCommentPostedEvent({
            aggregateId: COMMENT_ID,
            bugId: BUG_ID,
            bugAuthorId: 'author',
            commenterId: 'dev',
            bugTitle: 'Падает',
            excerpt,
            metadata,
        });

    it('has a stable type and aggregate id equal to the comment id', () => {
        expect(BUG_COMMENT_POSTED_EVENT_TYPE).toBe('portal.bug_comment_posted');
        expect(posted().aggregateId).toBe(COMMENT_ID);
        expect(posted().commentId).toBe(COMMENT_ID);
    });

    it('serializes the payload and restores an equal event', () => {
        const events = registry();
        const original = posted();
        expect(events.serialize(original).payload).toEqual({
            bugId: BUG_ID,
            bugAuthorId: 'author',
            commenterId: 'dev',
            bugTitle: 'Падает',
            excerpt: 'Привет',
        });
        const restored = roundTrip(events, original);
        expect(restored).toBeInstanceOf(BugCommentPostedEvent);
        if (!(restored instanceof BugCommentPostedEvent)) return;
        expect(restored.aggregateId).toBe(COMMENT_ID);
        expect(restored.bugTitle).toBe('Падает');
        expect(restored.excerpt).toBe('Привет');
    });

    it('accepts a truncated excerpt of at most 200 chars and rejects a longer one', () => {
        const events = registry();
        const excerpt = commentExcerpt('я'.repeat(500));
        expect(excerpt.length).toBeLessThanOrEqual(COMMENT_EXCERPT_LENGTH);
        expect(excerpt.endsWith('…')).toBe(true);
        expect(() => roundTrip(events, posted(excerpt))).not.toThrow();
        expect(() => roundTrip(events, posted('я'.repeat(201)))).toThrow(InvalidEventPayloadError);
    });

    it('rejects a payload without an excerpt', () => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: BUG_COMMENT_POSTED_EVENT_TYPE,
                aggregateId: COMMENT_ID,
                payload: { bugId: 'b', bugAuthorId: 'a', commenterId: 'c', bugTitle: 't' },
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});

describe('BUG_STATUS_LABELS', () => {
    it('has a Russian label for every status', () => {
        expect(BUG_STATUS_LABELS).toEqual({
            open: 'Открыт',
            in_progress: 'В работе',
            resolved: 'Исправлен',
            wont_fix: 'Не будет исправлен',
        });
        expect(Object.keys(BUG_STATUS_LABELS).sort()).toEqual([...BUG_STATUSES].sort());
    });
});
