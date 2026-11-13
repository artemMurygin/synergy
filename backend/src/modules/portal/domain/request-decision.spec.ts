import { describe, expect, it } from 'vitest';
import { RequestDecision } from './request-decision';

const T = new Date('2026-01-02T10:00:00Z');

describe('RequestDecision', () => {
    it('builds the three variants', () => {
        expect(RequestDecision.pending()).toEqual({ kind: 'pending' });
        expect(RequestDecision.accepted('s1', 'dev1', T)).toEqual({
            kind: 'accepted',
            skillId: 's1',
            decidedBy: 'dev1',
            decidedAt: T,
        });
        expect(RequestDecision.rejected('нет', 'dev1', T)).toEqual({
            kind: 'rejected',
            reason: 'нет',
            decidedBy: 'dev1',
            decidedAt: T,
        });
    });
});
