import { describe, expect, it } from 'vitest';
import { InvalidSkillNameError, MAX_SKILL_NAME_LENGTH, SkillName } from './skill-name';

describe('SkillName', () => {
    it('trims surrounding whitespace', () => {
        expect(SkillName.of('  Сводка встречи \n').value).toBe('Сводка встречи');
    });

    it('rejects empty or blank', () => {
        expect(() => SkillName.of('')).toThrow(InvalidSkillNameError);
        expect(() => SkillName.of('  \t ')).toThrow(InvalidSkillNameError);
    });

    it('enforces the length limit after trimming', () => {
        expect(SkillName.of(` ${'a'.repeat(MAX_SKILL_NAME_LENGTH)} `).value).toHaveLength(
            MAX_SKILL_NAME_LENGTH,
        );
        expect(() => SkillName.of('a'.repeat(MAX_SKILL_NAME_LENGTH + 1))).toThrow(
            InvalidSkillNameError,
        );
    });
});
