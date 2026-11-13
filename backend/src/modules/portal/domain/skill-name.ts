import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_SKILL_NAME_LENGTH = 200;

export class InvalidSkillNameError extends ArgumentInvalidError {}

/** Skill name: trimmed, 1-200 characters. */
export class SkillName {
    private constructor(readonly value: string) {}

    static of(raw: string): SkillName {
        const value = raw.trim();
        if (value.length === 0) throw new InvalidSkillNameError('Skill name must not be empty');
        if (value.length > MAX_SKILL_NAME_LENGTH) {
            throw new InvalidSkillNameError(
                `Skill name is longer than ${String(MAX_SKILL_NAME_LENGTH)} characters`,
            );
        }
        return new SkillName(value);
    }

    equals(other: SkillName): boolean {
        return this.value === other.value;
    }
}
