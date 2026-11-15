import { describe, expect, it } from 'vitest';
import { SKILL_STATUS_LABELS } from '../contracts/skill-status-labels';
import { InvalidSkillStatusError, SKILL_STATUSES, SkillStatus } from './skill-status';

const ALLOWED: readonly (readonly [SkillStatus, SkillStatus])[] = [
    ['planned', 'in_dev'],
    ['in_dev', 'testing'],
    ['testing', 'launched'],
    ['testing', 'rework'],
    ['launched', 'rework'],
    ['rework', 'testing'],
];

describe('SkillStatus', () => {
    it('lists statuses including rework', () => {
        expect(SKILL_STATUSES).toEqual(['planned', 'in_dev', 'testing', 'launched', 'rework']);
        expect(SKILL_STATUS_LABELS.rework).toBe('Доработка');
    });

    it('allowedNext lists exactly the transitions table', () => {
        expect(SkillStatus.allowedNext('planned')).toEqual(['in_dev']);
        expect(SkillStatus.allowedNext('in_dev')).toEqual(['testing']);
        expect([...SkillStatus.allowedNext('testing')].sort()).toEqual(['launched', 'rework']);
        expect(SkillStatus.allowedNext('launched')).toEqual(['rework']);
        expect(SkillStatus.allowedNext('rework')).toEqual(['testing']);
    });

    it('canMove allows exactly the allowed pairs and nothing else', () => {
        for (const from of SKILL_STATUSES) {
            for (const to of SKILL_STATUSES) {
                const expected = ALLOWED.some(([f, t]) => f === from && t === to);
                expect(SkillStatus.canMove(from, to), `${from} -> ${to}`).toBe(expected);
            }
        }
    });

    it('parses known values and rejects unknown', () => {
        expect(SkillStatus.parse('testing')).toBe('testing');
        expect(SkillStatus.parse('rework')).toBe('rework');
        expect(() => SkillStatus.parse('done')).toThrow(InvalidSkillStatusError);
        expect(() => SkillStatus.parse('')).toThrow(InvalidSkillStatusError);
    });
});
