import { describe, expect, it } from 'vitest';
import { RequestTakenEvent } from '../../portal/contracts/request-taken.event';
import { RequestTakenRule } from './request-taken.rule';

const REQUEST_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'dev-id' };

function taken(authorId = 'anna-id', reviewerId = 'dev-id'): RequestTakenEvent {
    return new RequestTakenEvent({
        aggregateId: REQUEST_ID,
        authorId,
        reviewerId,
        requestTitle: 'Сверка актов',
        metadata,
    });
}

describe('RequestTakenRule', () => {
    const rule = new RequestTakenRule();

    it('drafts request.under-review for the author with the title and the reviewer name', () => {
        const drafts = rule.apply(taken(), 'Петров Пётр Петрович');

        expect(drafts).toHaveLength(1);
        const [draft] = drafts;
        expect(draft.recipientId).toBe('anna-id');
        expect(draft.type).toBe('request.under-review');
        expect(draft.content.title).toBe('Заявка взята в работу: Сверка актов');
        expect(draft.content.body).toContain('Сверка актов');
        expect(draft.content.body).toContain('Петров Пётр Петрович');
        expect(draft.target.type).toBe('request');
        expect(draft.target.id).toBe(REQUEST_ID);
        expect(draft.actorId).toBe('dev-id');
    });

    it('drafts nothing when the author took their own request', () => {
        expect(rule.apply(taken('dev-id', 'dev-id'), 'Петров')).toEqual([]);
    });
});
