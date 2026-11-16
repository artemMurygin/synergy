import { describe, expect, it } from 'vitest';
import { BugReportedEvent } from '../../portal/contracts/bug-reported.event';
import { BugReportedRule } from './bug-reported.rule';

const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };

function reported(title = 'Падает выгрузка'): BugReportedEvent {
    return new BugReportedEvent({
        aggregateId: 'bug-1',
        bugId: 'bug-1',
        authorId: 'anna-id',
        title,
        productName: 'Аудит',
        agentName: 'Сверка актов',
        metadata,
    });
}

describe('BugReportedRule', () => {
    const rule = new BugReportedRule();

    it('notifies every developer except the author', () => {
        const drafts = rule.apply(reported(), 'Анна Иванова', ['dev-1', 'anna-id', 'dev-2']);

        expect(drafts.map((d) => d.recipientId)).toEqual(['dev-1', 'dev-2']);
        expect(drafts[0].type).toBe('bug.reported');
        expect(drafts[0].content.title).toBe('Новый баг: Падает выгрузка');
        expect(drafts[0].content.body).toBe('Анна Иванова · Аудит · Сверка актов');
        expect(drafts[0].target.type).toBe('bug');
        expect(drafts[0].target.id).toBe('bug-1');
        expect(drafts[0].actorId).toBe('anna-id');
    });

    it('returns nothing when the author is the only developer', () => {
        expect(rule.apply(reported(), 'Анна', ['anna-id'])).toEqual([]);
    });

    it('truncates a long title to fit the limit', () => {
        const [draft] = rule.apply(reported('Т'.repeat(200)), 'Анна', ['dev-1']);

        expect(draft.content.title.length).toBeLessThanOrEqual(200);
        expect(draft.content.title.endsWith('…')).toBe(true);
    });
});
