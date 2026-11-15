import { describe, expect, it } from 'vitest';
import { RequestCommentPostedEvent } from '../../portal/contracts/request-comment-posted.event';
import { RequestCommentRule } from './request-comment.rule';

const REQUEST_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };

function posted(commenterId: string, requestAuthorId = 'anna-id'): RequestCommentPostedEvent {
    return new RequestCommentPostedEvent({
        aggregateId: 'comment-1',
        requestId: REQUEST_ID,
        requestAuthorId,
        commenterId,
        requestTitle: 'Сверка актов',
        excerpt: 'Нужны уточнения',
        metadata,
    });
}

describe('RequestCommentRule', () => {
    const rule = new RequestCommentRule();

    describe('recipients', () => {
        it('the author commenting notifies all developers except themselves', () => {
            expect(rule.recipients(posted('dev-1', 'dev-1'), ['dev-1', 'dev-2', 'dev-3'])).toEqual([
                'dev-2',
                'dev-3',
            ]);
        });

        it('the author who is not a developer notifies every developer', () => {
            expect(rule.recipients(posted('anna-id'), ['dev-1', 'dev-2'])).toEqual([
                'dev-1',
                'dev-2',
            ]);
        });

        it('a non-author commenting notifies only the request author', () => {
            expect(rule.recipients(posted('dev-1'), ['dev-1', 'dev-2'])).toEqual(['anna-id']);
        });

        it('the only developer commenting on their own request notifies nobody', () => {
            expect(rule.recipients(posted('dev-1', 'dev-1'), ['dev-1'])).toEqual([]);
        });
    });

    describe('apply', () => {
        it('drafts request.comment-added for the author when a developer comments', () => {
            const drafts = rule.apply(posted('dev-1'), 'Петров Пётр', ['dev-1', 'dev-2']);

            expect(drafts).toHaveLength(1);
            const [draft] = drafts;
            expect(draft.recipientId).toBe('anna-id');
            expect(draft.type).toBe('request.comment-added');
            expect(draft.content.title).toBe('Новый комментарий к заявке: Сверка актов');
            expect(draft.content.body).toBe('Петров Пётр: Нужны уточнения');
            expect(draft.target.type).toBe('request');
            expect(draft.target.id).toBe(REQUEST_ID);
            expect(draft.actorId).toBe('dev-1');
        });

        it('drafts one notification per developer when the author comments', () => {
            const drafts = rule.apply(posted('anna-id'), 'Анна', ['dev-1', 'dev-2']);

            expect(drafts.map((draft) => draft.recipientId)).toEqual(['dev-1', 'dev-2']);
            expect(drafts.every((draft) => draft.actorId === 'anna-id')).toBe(true);
        });

        it('drafts nothing for the only developer commenting on their own request', () => {
            expect(rule.apply(posted('dev-1', 'dev-1'), 'Петров', ['dev-1'])).toEqual([]);
        });
    });
});
