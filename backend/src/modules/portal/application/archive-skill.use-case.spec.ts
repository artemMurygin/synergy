import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../domain/agent';
import { AgentArchivedError, SkillNotFoundError } from '../domain/errors';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { ArchiveSkillUseCase } from './archive-skill.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    archive: ArchiveSkillUseCase;
    agent: Agent;
    skill: Skill;
}

async function setup(): Promise<Setup> {
    const fx = createPortalFixture();
    fx.catalog.addProduct('control-center', 'Control Center');
    const agent = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');
    const skill = Skill.create({
        id: 'skill-1',
        agentId: agent.id,
        name: SkillName.of('Навык'),
        now: new Date('2026-01-01T00:00:00Z'),
    });
    skill.changeStatus('in_dev', new Date('2026-01-02T00:00:00Z'));
    await fx.skills.save(skill);
    const archive = new ArchiveSkillUseCase(
        fx.skills,
        fx.catalog,
        fx.skillQuery,
        fx.clock,
        fx.transactions,
    );
    return { ...fx, archive, agent, skill };
}

describe('ArchiveSkillUseCase', () => {
    it('архивирует навык: archivedAt заполнен, статус прежний, события нет', async () => {
        const { archive, clock, events, skills, skill } = await setup();
        const save = vi.spyOn(skills, 'save');

        const view = await archive.archive(skill.id);

        expect(skill.archivedAt).toEqual(clock.now());
        expect(skill.status).toBe('in_dev');
        expect(view.id).toBe(skill.id);
        expect(view.status).toBe('in_dev');
        expect(view.nextStatuses).toEqual(['testing']);
        expect(save).toHaveBeenCalledTimes(1);
        expect(skills.lockedIds).toEqual([skill.id]);
        expect(events.published).toHaveLength(0);
    });

    it('повторная архивация идемпотентна: 200 без save и без смены archivedAt', async () => {
        const { archive, clock, skills, skill } = await setup();
        await archive.archive(skill.id);
        const firstArchivedAt = skill.archivedAt;
        clock.set(new Date('2026-05-01T00:00:00Z'));
        const save = vi.spyOn(skills, 'save');

        const view = await archive.archive(skill.id);

        expect(view.id).toBe(skill.id);
        expect(skill.archivedAt).toEqual(firstArchivedAt);
        expect(save).not.toHaveBeenCalled();
    });

    it('восстанавливает навык: archivedAt очищен, статус прежний, события нет', async () => {
        const { archive, events, skill } = await setup();
        await archive.archive(skill.id);

        const view = await archive.restore(skill.id);

        expect(skill.archivedAt).toBeNull();
        expect(view.status).toBe('in_dev');
        expect(events.published).toHaveLength(0);
    });

    it('восстановление неархивного навыка идемпотентно: без save, даже при архивном агенте', async () => {
        const { archive, agent, skills, skill } = await setup();
        agent.archive(new Date('2026-02-01T00:00:00Z'));
        const save = vi.spyOn(skills, 'save');

        const view = await archive.restore(skill.id);

        expect(view.id).toBe(skill.id);
        expect(save).not.toHaveBeenCalled();
    });

    it('восстановление при архивном агенте даёт AgentArchivedError, навык остаётся в архиве', async () => {
        const { archive, agent, catalog, skill } = await setup();
        await archive.archive(skill.id);
        agent.archive(new Date('2026-02-01T00:00:00Z'));

        await expect(archive.restore(skill.id)).rejects.toBeInstanceOf(AgentArchivedError);

        expect(skill.archivedAt).not.toBeNull();
        expect(catalog.sharedIds).toEqual([agent.id]);
    });

    it('архивация навыка архивного агента разрешена', async () => {
        const { archive, agent, skill } = await setup();
        agent.archive(new Date('2026-02-01T00:00:00Z'));

        await archive.archive(skill.id);

        expect(skill.archivedAt).not.toBeNull();
    });

    it('неизвестный навык даёт SkillNotFoundError', async () => {
        const { archive } = await setup();

        await expect(archive.archive('nope')).rejects.toBeInstanceOf(SkillNotFoundError);
        await expect(archive.restore('nope')).rejects.toBeInstanceOf(SkillNotFoundError);
    });
});
