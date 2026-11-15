import { describe, expect, it } from 'vitest';
import type { Agent } from '../domain/agent';
import { AgentNotFoundError } from '../domain/errors';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { ArchiveAgentUseCase } from './archive-agent.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    archive: ArchiveAgentUseCase;
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
    await fx.skills.save(skill);
    const archive = new ArchiveAgentUseCase(fx.catalog, fx.clock, fx.transactions);
    return { ...fx, archive, agent, skill };
}

describe('ArchiveAgentUseCase', () => {
    it('архивирует агента под FOR UPDATE и возвращает AgentView; навыки не меняются', async () => {
        const { archive, agent, skill, catalog, clock } = await setup();

        const view = await archive.archive(agent.id);

        expect(catalog.lockedIds).toEqual([agent.id]);
        expect(catalog.savedAgents).toHaveLength(1);
        expect(view).toEqual({
            id: agent.id,
            slug: 'tasks',
            name: 'Задачи',
            products: [
                { id: 'product-control-center', slug: 'control-center', name: 'Control Center' },
            ],
            archivedAt: clock.now(),
        });
        expect(skill.archivedAt).toBeNull();
    });

    it('повторная архивация идемпотентна: без saveAgent, archivedAt не меняется', async () => {
        const { archive, agent, catalog, clock } = await setup();
        await archive.archive(agent.id);
        const first = agent.archivedAt;
        clock.set(new Date('2026-05-01T00:00:00Z'));

        const view = await archive.archive(agent.id);

        expect(view.archivedAt).toEqual(first);
        expect(catalog.savedAgents).toHaveLength(1);
    });

    it('восстанавливает агента; навыки не затрагиваются', async () => {
        const { archive, agent, skill } = await setup();
        skill.archive(new Date('2026-01-03T00:00:00Z'));
        await archive.archive(agent.id);

        const view = await archive.restore(agent.id);

        expect(view.archivedAt).toBeNull();
        expect(agent.archivedAt).toBeNull();
        expect(skill.archivedAt).not.toBeNull();
    });

    it('восстановление неархивного агента идемпотентно: без saveAgent', async () => {
        const { archive, agent, catalog } = await setup();

        const view = await archive.restore(agent.id);

        expect(view.archivedAt).toBeNull();
        expect(catalog.savedAgents).toHaveLength(0);
    });

    it('неизвестный агент даёт AgentNotFoundError', async () => {
        const { archive } = await setup();

        await expect(archive.archive('nope')).rejects.toBeInstanceOf(AgentNotFoundError);
        await expect(archive.restore('nope')).rejects.toBeInstanceOf(AgentNotFoundError);
    });
});
