import { describe, expect, it } from 'vitest';
import { RequestDecision } from './request-decision';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');

describe('RequestDecision', () => {
    it('builds the four variants', () => {
        expect(RequestDecision.new()).toEqual({ kind: 'new' });
        expect(RequestDecision.underReview('dev1', T0)).toEqual({
            kind: 'under_review',
            reviewerId: 'dev1',
            takenAt: T0,
        });
        expect(RequestDecision.accepted('dev1', T0, 's1', 16, 'dev2', T1)).toEqual({
            kind: 'accepted',
            reviewerId: 'dev1',
            takenAt: T0,
            skillId: 's1',
            effortHours: 16,
            decidedBy: 'dev2',
            decidedAt: T1,
        });
        expect(RequestDecision.rejected('dev1', T0, 'нет', 'dev1', T1)).toEqual({
            kind: 'rejected',
            reviewerId: 'dev1',
            takenAt: T0,
            reason: 'нет',
            decidedBy: 'dev1',
            decidedAt: T1,
        });
    });

    it('accepted may carry a null effort (legacy rows)', () => {
        expect(RequestDecision.accepted('d', T0, 's1', null, 'd', T1)).toMatchObject({
            effortHours: null,
        });
    });
});
