import { describe, expect, it } from 'vitest';
import { BUG_STATUSES, BUG_TRANSITIONS, BugStatusPolicy } from './bug-status';

describe('BugStatusPolicy', () => {
    it('transition table matches the spec exactly', () => {
        expect(BUG_TRANSITIONS).toEqual({
            open: ['in_progress', 'wont_fix'],
            in_progress: ['resolved', 'wont_fix', 'open'],
            resolved: ['in_progress'],
            wont_fix: ['in_progress'],
        });
        expect(BUG_STATUSES).toEqual(['open', 'in_progress', 'resolved', 'wont_fix']);
    });

    it('nextStatuses reads the table', () => {
        expect(BugStatusPolicy.nextStatuses('open')).toEqual(['in_progress', 'wont_fix']);
        expect(BugStatusPolicy.nextStatuses('wont_fix')).toEqual(['in_progress']);
    });

    it('canTransition allows listed and rejects others', () => {
        expect(BugStatusPolicy.canTransition('in_progress', 'open')).toBe(true);
        expect(BugStatusPolicy.canTransition('open', 'resolved')).toBe(false);
        expect(BugStatusPolicy.canTransition('resolved', 'wont_fix')).toBe(false);
        expect(BugStatusPolicy.canTransition('open', 'open')).toBe(false);
    });
});
