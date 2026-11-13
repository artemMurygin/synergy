import { describe, expect, it } from 'vitest';
import { InvalidSkillStatusError, SKILL_STATUSES, SkillStatus } from './skill-status';

describe('SkillStatus', () => {
    it('lists statuses in lifecycle order', () => {
        expect(SKILL_STATUSES).toEqual(['planned', 'in_dev', 'testing', 'launched']);
    });

    it('next() returns the neighbour or null for launched', () => {
        expect(SkillStatus.next('planned')).toBe('in_dev');
        expect(SkillStatus.next('in_dev')).toBe('testing');
        expect(SkillStatus.next('testing')).toBe('launched');
        expect(SkillStatus.next('launched')).toBeNull();
    });

    it('allows only the adjacent forward transition', () => {
        expect(SkillStatus.canAdvanceTo('planned', 'in_dev')).toBe(true);
        expect(SkillStatus.canAdvanceTo('in_dev', 'testing')).toBe(true);
        expect(SkillStatus.canAdvanceTo('testing', 'launched')).toBe(true);
    });

    it('rejects repeat, skip, backward and any move out of launched', () => {
        expect(SkillStatus.canAdvanceTo('planned', 'planned')).toBe(false);
        expect(SkillStatus.canAdvanceTo('planned', 'testing')).toBe(false);
        expect(SkillStatus.canAdvanceTo('planned', 'launched')).toBe(false);
        expect(SkillStatus.canAdvanceTo('testing', 'in_dev')).toBe(false);
        for (const to of SKILL_STATUSES) {
            expect(SkillStatus.canAdvanceTo('launched', to)).toBe(false);
        }
    });

    it('parses known values and rejects unknown', () => {
        expect(SkillStatus.parse('testing')).toBe('testing');
        expect(() => SkillStatus.parse('done')).toThrow(InvalidSkillStatusError);
        expect(() => SkillStatus.parse('')).toThrow(InvalidSkillStatusError);
    });
});
