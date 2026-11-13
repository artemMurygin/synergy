import { describe, expect, it } from 'vitest';
import { RequestDecision } from './request-decision';
import { RequestStatusPolicy } from './request-status-policy';

const T = new Date('2026-01-02T10:00:00Z');
const accepted = RequestDecision.accepted('s1', 'dev1', T);

describe('RequestStatusPolicy.statusOf', () => {
    it('pending -> На рассмотрении', () => {
        expect(RequestStatusPolicy.statusOf(RequestDecision.pending(), null)).toEqual({
            code: 'pending',
            label: 'На рассмотрении',
        });
    });

    it('rejected -> Отклонена', () => {
        expect(
            RequestStatusPolicy.statusOf(RequestDecision.rejected('нет', 'dev1', T), null),
        ).toEqual({ code: 'rejected', label: 'Отклонена' });
    });

    it.each([
        ['planned', 'Запланировано'],
        ['in_dev', 'В разработке'],
        ['testing', 'Тестируется'],
        ['launched', 'Запущено'],
    ] as const)('accepted + %s -> %s', (skillStatus, label) => {
        expect(RequestStatusPolicy.statusOf(accepted, skillStatus)).toEqual({
            code: skillStatus,
            label,
        });
    });

    it('accepted without a skill status is an integrity error', () => {
        expect(() => RequestStatusPolicy.statusOf(accepted, null)).toThrow(/integrity|skill/i);
    });

    it('ignores a skill status for pending and rejected', () => {
        expect(RequestStatusPolicy.statusOf(RequestDecision.pending(), 'launched').code).toBe(
            'pending',
        );
    });
});
