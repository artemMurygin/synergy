import { describe, expect, it } from 'vitest';
import { InvalidSkillTransitionError } from './errors';
import { Skill } from './skill';
import { SkillName } from './skill-name';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');

function newSkill(): Skill {
    return Skill.create({
        id: 's1',
        agentId: 'a1',
        name: SkillName.of('Сводка встречи'),
        description: 'Описание',
        now: T0,
    });
}

describe('Skill', () => {
    it('is always created as planned with statusChangedAt = now', () => {
        const skill = newSkill();
        expect(skill.status).toBe('planned');
        expect(skill.statusChangedAt).toEqual(T0);
        expect(skill.createdAt).toEqual(T0);
        expect(skill.agentId).toBe('a1');
        expect(skill.name.value).toBe('Сводка встречи');
        expect(skill.description).toBe('Описание');
    });

    it('allows an empty description', () => {
        const skill = Skill.create({
            id: 's2',
            agentId: 'a1',
            name: SkillName.of('X'),
            now: T0,
        });
        expect(skill.description).toBe('');
    });

    it('advance moves to the next status and updates statusChangedAt', () => {
        const skill = newSkill();
        skill.advance('in_dev', T1);
        expect(skill.status).toBe('in_dev');
        expect(skill.statusChangedAt).toEqual(T1);
    });

    it.each([
        ['planned', 'testing'],
        ['planned', 'planned'],
        ['planned', 'launched'],
    ] as const)('rejects %s -> %s and keeps the state', (_from, to) => {
        const skill = newSkill();
        expect(() => {
            skill.advance(to, T1);
        }).toThrow(InvalidSkillTransitionError);
        expect(skill.status).toBe('planned');
        expect(skill.statusChangedAt).toEqual(T0);
    });

    it('rejects going backward and leaving launched', () => {
        const skill = newSkill();
        skill.advance('in_dev', T1);
        skill.advance('testing', T1);
        expect(() => {
            skill.advance('in_dev', T1);
        }).toThrow(InvalidSkillTransitionError);
        expect(skill.status).toBe('testing');
        skill.advance('launched', T1);
        expect(() => {
            skill.advance('launched', T1);
        }).toThrow(InvalidSkillTransitionError);
        expect(skill.status).toBe('launched');
    });

    it('restores from storage without changing fields', () => {
        const skill = Skill.restore({
            id: 's1',
            agentId: 'a1',
            name: SkillName.of('N'),
            description: '',
            status: 'testing',
            createdAt: T0,
            updatedAt: T1,
            statusChangedAt: T1,
        });
        expect(skill.status).toBe('testing');
        expect(skill.statusChangedAt).toEqual(T1);
        expect(skill.createdAt).toEqual(T0);
    });
});
