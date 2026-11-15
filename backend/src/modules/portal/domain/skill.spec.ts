import { describe, expect, it } from 'vitest';
import { InvalidSkillTransitionError, SkillArchivedError } from './errors';
import { Skill } from './skill';
import { SkillName } from './skill-name';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');
const T2 = new Date('2026-01-03T10:00:00Z');
const T3 = new Date('2026-01-04T10:00:00Z');

function newSkill(): Skill {
    return Skill.create({
        id: 's1',
        agentId: 'a1',
        name: SkillName.of('Сводка встречи'),
        description: 'Описание',
        now: T0,
    });
}

function skillAt(path: readonly ('in_dev' | 'testing' | 'launched' | 'rework')[]): Skill {
    const skill = newSkill();
    for (const status of path) skill.changeStatus(status, T1);
    return skill;
}

describe('Skill', () => {
    it('is always created as planned with statusChangedAt = now and no launch/archive dates', () => {
        const skill = newSkill();
        expect(skill.status).toBe('planned');
        expect(skill.statusChangedAt).toEqual(T0);
        expect(skill.createdAt).toEqual(T0);
        expect(skill.agentId).toBe('a1');
        expect(skill.name.value).toBe('Сводка встречи');
        expect(skill.description).toBe('Описание');
        expect(skill.launchedAt).toBeNull();
        expect(skill.archivedAt).toBeNull();
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

    it('changeStatus moves along an allowed transition and updates statusChangedAt', () => {
        const skill = newSkill();
        skill.changeStatus('in_dev', T1);
        expect(skill.status).toBe('in_dev');
        expect(skill.statusChangedAt).toEqual(T1);
        expect(skill.launchedAt).toBeNull();
    });

    it.each([
        ['planned', 'testing'],
        ['planned', 'planned'],
        ['planned', 'launched'],
        ['planned', 'rework'],
    ] as const)('rejects %s -> %s and keeps the state', (_from, to) => {
        const skill = newSkill();
        expect(() => {
            skill.changeStatus(to, T1);
        }).toThrow(InvalidSkillTransitionError);
        expect(skill.status).toBe('planned');
        expect(skill.statusChangedAt).toEqual(T0);
    });

    it('rejects going backward, repeats and launched -> testing', () => {
        const skill = skillAt(['in_dev', 'testing']);
        expect(() => {
            skill.changeStatus('in_dev', T2);
        }).toThrow(InvalidSkillTransitionError);
        expect(skill.status).toBe('testing');
        skill.changeStatus('launched', T2);
        expect(() => {
            skill.changeStatus('launched', T3);
        }).toThrow(InvalidSkillTransitionError);
        expect(() => {
            skill.changeStatus('testing', T3);
        }).toThrow(InvalidSkillTransitionError);
        expect(skill.status).toBe('launched');
    });

    it('supports the rework loop testing -> rework -> testing -> launched', () => {
        const skill = skillAt(['in_dev', 'testing']);
        skill.changeStatus('rework', T2);
        expect(skill.status).toBe('rework');
        skill.changeStatus('testing', T2);
        skill.changeStatus('launched', T2);
        expect(skill.status).toBe('launched');
    });

    it('writes launchedAt on the first launch only', () => {
        const skill = skillAt(['in_dev', 'testing']);
        skill.changeStatus('launched', T2);
        expect(skill.launchedAt).toEqual(T2);
        skill.changeStatus('rework', T3);
        expect(skill.launchedAt).toEqual(T2);
        skill.changeStatus('testing', T3);
        skill.changeStatus('launched', T3);
        expect(skill.launchedAt).toEqual(T2);
        expect(skill.statusChangedAt).toEqual(T3);
    });

    it('archive is idempotent and keeps status and launchedAt', () => {
        const skill = skillAt(['in_dev', 'testing', 'launched']);
        const launchedAt = skill.launchedAt;
        expect(skill.archive(T2)).toBe(true);
        expect(skill.archivedAt).toEqual(T2);
        expect(skill.archive(T3)).toBe(false);
        expect(skill.archivedAt).toEqual(T2);
        expect(skill.status).toBe('launched');
        expect(skill.launchedAt).toEqual(launchedAt);
    });

    it('restore is idempotent and keeps status and launchedAt', () => {
        const skill = skillAt(['in_dev', 'testing', 'launched']);
        expect(skill.restore()).toBe(false);
        skill.archive(T2);
        expect(skill.restore()).toBe(true);
        expect(skill.archivedAt).toBeNull();
        expect(skill.restore()).toBe(false);
        expect(skill.status).toBe('launched');
        expect(skill.launchedAt).toEqual(T1);
    });

    it('rejects status change of an archived skill and keeps the state', () => {
        const skill = skillAt(['in_dev']);
        skill.archive(T2);
        expect(() => {
            skill.changeStatus('testing', T3);
        }).toThrow(SkillArchivedError);
        expect(skill.status).toBe('in_dev');
        expect(skill.statusChangedAt).toEqual(T1);
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
            launchedAt: T0,
            archivedAt: T2,
        });
        expect(skill.status).toBe('testing');
        expect(skill.statusChangedAt).toEqual(T1);
        expect(skill.createdAt).toEqual(T0);
        expect(skill.launchedAt).toEqual(T0);
        expect(skill.archivedAt).toEqual(T2);
    });
});
