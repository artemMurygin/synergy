import { describe, expect, it } from 'vitest';
import { BugCommentPostedEvent } from '../../portal/contracts/bug-comment-posted.event';
import { BugCommentRule } from './bug-comment.rule';

const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'u' };

function posted(commenterId: string, bugTitle = 'Падает выгрузка'): BugCommentPostedEvent {
    return new BugCommentPostedEvent({
        aggregateId: 'comment-1',
        bugId: 'bug-1',
        bugAuthorId: 'anna-id',
        commenterId,
        bugTitle,
        excerpt: 'Нужны уточнения',
        metadata,
    });
}

describe('BugCommentRule', () => {
    const rule = new BugCommentRule();

    it('recipients: the author comments -> developers without the author', () => {
        expect(rule.recipients(posted('anna-id'), ['dev-1', 'anna-id', 'dev-2'])).toEqual([
            'dev-1',
            'dev-2',
        ]);
    });

    it('recipients: a developer comments -> the bug author only', () => {
        expect(rule.recipients(posted('dev-1'), ['dev-1', 'dev-2'])).toEqual(['anna-id']);
    });

    it('builds the draft', () => {
        const [draft] = rule.apply(posted('dev-1'), 'Петров Пётр', []);

        expect(draft.recipientId).toBe('anna-id');
        expect(draft.type).toBe('bug.comment-added');
        expect(draft.content.title).toBe('Новый комментарий к багу: Падает выгрузка');
        expect(draft.content.body).toBe('Петров Пётр: Нужны уточнения');
        expect(draft.target.type).toBe('bug');
        expect(draft.target.id).toBe('bug-1');
        expect(draft.actorId).toBe('dev-1');
    });

    it('truncates a long title', () => {
        const [draft] = rule.apply(posted('dev-1', 'Т'.repeat(200)), 'П', []);

        expect(draft.content.title.length).toBeLessThanOrEqual(200);
    });
});
