import { describe, expect, it } from 'vitest';
import { RequestDecision } from './request-decision';
import { RequestStatusPolicy } from './request-status-policy';

const T = new Date('2026-01-02T10:00:00Z');
const accepted = RequestDecision.accepted('dev1', T, 's1', 8, 'dev1', T);
const rejected = RequestDecision.rejected('dev1', T, 'нет', 'dev1', T);

describe('RequestStatusPolicy.statusOf', () => {
    it('new -> Новая', () => {
        expect(RequestStatusPolicy.statusOf(RequestDecision.new(), null)).toEqual({
            code: 'new',
            label: 'Новая',
        });
    });

    it('under_review -> На рассмотрении', () => {
        expect(RequestStatusPolicy.statusOf(RequestDecision.underReview('dev1', T), null)).toEqual({
            code: 'under_review',
            label: 'На рассмотрении',
        });
    });

    it('rejected -> Отклонена', () => {
        expect(RequestStatusPolicy.statusOf(rejected, null)).toEqual({
            code: 'rejected',
            label: 'Отклонена',
        });
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

    it('ignores a skill status for new and under_review', () => {
        expect(RequestStatusPolicy.statusOf(RequestDecision.new(), 'launched').code).toBe('new');
        expect(
            RequestStatusPolicy.statusOf(RequestDecision.underReview('d', T), 'launched').code,
        ).toBe('under_review');
    });
});
