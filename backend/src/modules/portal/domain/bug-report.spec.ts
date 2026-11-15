import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { BugReport } from './bug-report';
import { BugTitle } from './bug-title';
import { BugDescription } from './bug-description';
import { InvalidBugTransitionError } from './errors';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');

function newBug(): BugReport {
    return BugReport.report({
        id: 'b1',
        authorId: 'u1',
        productId: 'p1',
        agentId: 'a1',
        title: BugTitle.of('Падает'),
        description: BugDescription.of('Описание'),
        now: T0,
    });
}

describe('BugReport', () => {
    it('report creates an open bug without status author', () => {
        const bug = newBug();
        expect(bug.status).toBe('open');
        expect(bug.wontFixReason).toBeNull();
        expect(bug.statusChangedBy).toBeNull();
        expect(bug.statusChangedAt).toEqual(T0);
        expect(bug.createdAt).toEqual(T0);
        expect(bug.authorId).toBe('u1');
    });

    it('changeStatus records actor and time and returns the previous status', () => {
        const bug = newBug();
        const prev = bug.changeStatus('in_progress', 'dev', null, T1);
        expect(prev).toBe('open');
        expect(bug.status).toBe('in_progress');
        expect(bug.statusChangedBy).toBe('dev');
        expect(bug.statusChangedAt).toEqual(T1);
    });

    it('rejects a transition outside the table', () => {
        const bug = newBug();
        expect(() => bug.changeStatus('resolved', 'dev', null, T1)).toThrow(
            InvalidBugTransitionError,
        );
        expect(bug.status).toBe('open');
    });

    it('wont_fix requires a reason', () => {
        const bug = newBug();
        expect(() => bug.changeStatus('wont_fix', 'dev', null, T1)).toThrow(ArgumentInvalidError);
        expect(() => bug.changeStatus('wont_fix', 'dev', '   ', T1)).toThrow(ArgumentInvalidError);
        expect(bug.status).toBe('open');
    });

    it('wont_fix stores the trimmed reason', () => {
        const bug = newBug();
        bug.changeStatus('wont_fix', 'dev', ' так задумано ', T1);
        expect(bug.status).toBe('wont_fix');
        expect(bug.wontFixReason?.value).toBe('так задумано');
    });

    it('ignores a reason for other statuses', () => {
        const bug = newBug();
        bug.changeStatus('in_progress', 'dev', 'лишнее', T1);
        expect(bug.wontFixReason).toBeNull();
    });

    it('leaving wont_fix clears the reason', () => {
        const bug = newBug();
        bug.changeStatus('wont_fix', 'dev', 'нет', T1);
        bug.changeStatus('in_progress', 'dev', null, T1);
        expect(bug.wontFixReason).toBeNull();
    });

    it('restore keeps persisted state', () => {
        const bug = BugReport.restore({
            id: 'b1',
            authorId: 'u1',
            productId: 'p1',
            agentId: 'a1',
            title: BugTitle.of('t'),
            description: BugDescription.of('d'),
            status: 'resolved',
            wontFixReason: null,
            statusChangedBy: 'dev',
            statusChangedAt: T1,
            createdAt: T0,
        });
        expect(bug.status).toBe('resolved');
        expect(bug.createdAt).toEqual(T0);
        expect(bug.statusChangedBy).toBe('dev');
    });
});
