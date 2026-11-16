import { describe, expect, it } from 'vitest';
import {
    BugStatusChangedEvent,
    type BugStatusChangedPayload,
} from '../../portal/contracts/bug-status-changed.event';
import { BugStatusChangedRule } from './bug-status-changed.rule';

const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };

function changed(
    over: Partial<Pick<BugStatusChangedPayload, 'changedBy' | 'to' | 'reason' | 'title'>> = {},
): BugStatusChangedEvent {
    return new BugStatusChangedEvent({
        aggregateId: 'bug-1',
        bugId: 'bug-1',
        authorId: 'anna-id',
        changedBy: 'dev-1',
        title: 'Падает выгрузка',
        from: 'open',
        to: 'in_progress',
        reason: null,
        metadata,
        ...over,
    });
}

describe('BugStatusChangedRule', () => {
    const rule = new BugStatusChangedRule();

    it('notifies the author with the status label', () => {
        const drafts = rule.apply(changed(), 'Петров Пётр');

        expect(drafts).toHaveLength(1);
        expect(drafts[0].recipientId).toBe('anna-id');
        expect(drafts[0].type).toBe('bug.status-changed');
        expect(drafts[0].content.title).toBe('Баг «Падает выгрузка»: В работе');
        expect(drafts[0].content.body).toBe('Петров Пётр сменил статус');
        expect(drafts[0].target.type).toBe('bug');
        expect(drafts[0].target.id).toBe('bug-1');
        expect(drafts[0].actorId).toBe('dev-1');
    });

    it('adds the reason for wont_fix', () => {
        const [draft] = rule.apply(changed({ to: 'wont_fix', reason: 'Не воспроизводится' }), 'П');

        expect(draft.content.title).toBe('Баг «Падает выгрузка»: Не будет исправлен');
        expect(draft.content.body).toBe('П сменил статус\nПричина: Не воспроизводится');
    });

    it('notifies nobody when the author changes the status of their own bug', () => {
        expect(rule.apply(changed({ changedBy: 'anna-id' }), 'Анна')).toEqual([]);
    });

    it('keeps title and body within limits for long inputs', () => {
        const [draft] = rule.apply(
            changed({ title: 'Т'.repeat(200), to: 'wont_fix', reason: 'П'.repeat(2000) }),
            'Петров',
        );

        expect(draft.content.title.length).toBeLessThanOrEqual(200);
        expect(draft.content.body.length).toBeLessThanOrEqual(1000);
    });
});
