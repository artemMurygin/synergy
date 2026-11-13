import { describe, expect, it } from 'vitest';
import { RequestAcceptedEvent } from '../../portal/contracts/request-accepted.event';
import { RequestRejectedEvent } from '../../portal/contracts/request-rejected.event';
import { RequestDecisionRule } from './request-decision.rule';

const REQUEST_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const SKILL_ID = '9c1d2e3f-0a1b-4c5d-8e6f-7a8b9c0d1e2f';
const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'dev-id' };

function accepted(authorId = 'anna-id', decidedBy = 'dev-id'): RequestAcceptedEvent {
    return new RequestAcceptedEvent({
        aggregateId: REQUEST_ID,
        authorId,
        decidedBy,
        requestTitle: 'Сверка актов',
        skillId: SKILL_ID,
        skillName: 'Сверка актов',
        skillStatus: 'planned',
        metadata,
    });
}

function rejected(authorId = 'anna-id', decidedBy = 'dev-id'): RequestRejectedEvent {
    return new RequestRejectedEvent({
        aggregateId: REQUEST_ID,
        authorId,
        decidedBy,
        reason: 'Уже есть в поставке',
        requestTitle: 'Сверка актов',
        metadata,
    });
}

describe('RequestDecisionRule', () => {
    const rule = new RequestDecisionRule();

    it('drafts request.accepted for the author with request, skill and status in Russian', () => {
        const drafts = rule.apply(accepted(), 'petrov');

        expect(drafts).toHaveLength(1);
        const [draft] = drafts;
        expect(draft.recipientId).toBe('anna-id');
        expect(draft.type).toBe('request.accepted');
        expect(draft.content.title).toContain('Сверка актов');
        expect(draft.content.body).toContain('Сверка актов');
        expect(draft.content.body).toContain('Запланировано');
        expect(draft.target.type).toBe('request');
        expect(draft.target.id).toBe(REQUEST_ID);
        expect(draft.actorId).toBe('dev-id');
    });

    it('names the skill separately from the request title', () => {
        const event = new RequestAcceptedEvent({
            aggregateId: REQUEST_ID,
            authorId: 'anna-id',
            decidedBy: 'dev-id',
            requestTitle: 'Разбор почты',
            skillId: SKILL_ID,
            skillName: 'Почтовый агент',
            skillStatus: 'in_dev',
            metadata,
        });

        const [draft] = rule.apply(event, 'petrov');

        expect(`${draft.content.title} ${draft.content.body}`).toContain('Разбор почты');
        expect(draft.content.body).toContain('Почтовый агент');
        expect(draft.content.body).toContain('В разработке');
    });

    it('drafts request.rejected with the request title and the reason', () => {
        const [draft] = rule.apply(rejected(), 'petrov');

        expect(draft.recipientId).toBe('anna-id');
        expect(draft.type).toBe('request.rejected');
        expect(`${draft.content.title} ${draft.content.body}`).toContain('Сверка актов');
        expect(draft.content.body).toContain('Уже есть в поставке');
        expect(draft.target.type).toBe('request');
        expect(draft.target.id).toBe(REQUEST_ID);
        expect(draft.actorId).toBe('dev-id');
    });

    it('mentions the developer login in the text', () => {
        const [draft] = rule.apply(accepted(), 'petrov');

        expect(draft.content.body).toContain('petrov');
    });

    it('drafts nothing when the author and the developer are the same person', () => {
        expect(rule.apply(accepted('dev-id', 'dev-id'), 'petrov')).toEqual([]);
        expect(rule.apply(rejected('dev-id', 'dev-id'), 'petrov')).toEqual([]);
    });

    it('applies only when the author is not the developer', () => {
        expect(rule.appliesTo(accepted())).toBe(true);
        expect(rule.appliesTo(rejected('dev-id', 'dev-id'))).toBe(false);
    });
});
