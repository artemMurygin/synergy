import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { AgentArchivedError, AgentNotFoundError } from '../domain/errors';
import { GetAgentGuideUseCase } from './get-agent-guide.use-case';
import { SaveAgentGuideUseCase } from './save-agent-guide.use-case';
import type { Agent } from '../domain/agent';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    agent: Agent;
    get: GetAgentGuideUseCase;
    save: SaveAgentGuideUseCase;
}

function setup(): Setup {
    const fx = createPortalFixture();
    fx.catalog.addProduct('control-center', 'Control Center');
    const agent = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');
    const get = new GetAgentGuideUseCase(fx.catalog, fx.guideQuery);
    const save = new SaveAgentGuideUseCase(
        fx.catalog,
        fx.guides,
        fx.guideQuery,
        fx.clock,
        fx.transactions,
    );
    return { ...fx, agent, get, save };
}

const EMPTY = { body: null, updatedAt: null, updatedBy: null };

describe('GetAgentGuideUseCase', () => {
    it('нет инструкции: пустой GuideView', async () => {
        const { get, agent } = setup();
        expect(await get.execute({ agentId: agent.id })).toEqual(EMPTY);
    });

    it('возвращает сохранённую инструкцию с автором', async () => {
        const { get, save, agent, clock } = setup();
        await save.execute({ agentId: agent.id, actorId: 'u1', body: '# Заголовок' });
        expect(await get.execute({ agentId: agent.id })).toEqual({
            body: '# Заголовок',
            updatedAt: clock.now(),
            updatedBy: { id: 'u1', login: 'login-u1', fullName: 'Имя u1' },
        });
    });

    it('агент не найден: AgentNotFoundError', async () => {
        const { get } = setup();
        await expect(get.execute({ agentId: 'nope' })).rejects.toBeInstanceOf(AgentNotFoundError);
    });

    it('агент в архиве: AgentNotFoundError', async () => {
        const { get, agent, clock } = setup();
        agent.archive(clock.now());
        await expect(get.execute({ agentId: agent.id })).rejects.toBeInstanceOf(AgentNotFoundError);
    });
});

describe('SaveAgentGuideUseCase', () => {
    it('сохраняет под FOR SHARE и возвращает запись после коммита', async () => {
        const { save, agent, catalog, guides, transactions } = setup();

        const view = await save.execute({ agentId: agent.id, actorId: 'u1', body: '  текст  ' });

        expect(catalog.sharedIds).toEqual([agent.id]);
        expect(guides.guides.get(agent.id)?.body.value).toBe('текст');
        expect(view.body).toBe('текст');
        expect(view.updatedBy?.id).toBe('u1');
        expect(transactions.commits).toBe(1);
    });

    it('повторная запись заменяет текст и автора', async () => {
        const { save, agent } = setup();
        await save.execute({ agentId: agent.id, actorId: 'u1', body: 'a' });
        const view = await save.execute({ agentId: agent.id, actorId: 'u2', body: 'b' });
        expect(view.body).toBe('b');
        expect(view.updatedBy?.id).toBe('u2');
    });

    it('пустое тело после trim удаляет инструкцию и возвращает пустой GuideView', async () => {
        const { save, agent, guides } = setup();
        await save.execute({ agentId: agent.id, actorId: 'u1', body: 'a' });

        const view = await save.execute({ agentId: agent.id, actorId: 'u1', body: ' \n ' });

        expect(view).toEqual(EMPTY);
        expect(guides.guides.has(agent.id)).toBe(false);
    });

    it('агента нет: AgentNotFoundError, ничего не записано', async () => {
        const { save, guides } = setup();
        await expect(
            save.execute({ agentId: 'nope', actorId: 'u1', body: 'a' }),
        ).rejects.toBeInstanceOf(AgentNotFoundError);
        expect(guides.guides.size).toBe(0);
    });

    it('агент в архиве: AgentArchivedError, инструкция не меняется', async () => {
        const { save, agent, guides, clock } = setup();
        await save.execute({ agentId: agent.id, actorId: 'u1', body: 'a' });
        agent.archive(clock.now());

        await expect(
            save.execute({ agentId: agent.id, actorId: 'u1', body: 'b' }),
        ).rejects.toBeInstanceOf(AgentArchivedError);
        await expect(
            save.execute({ agentId: agent.id, actorId: 'u1', body: '' }),
        ).rejects.toBeInstanceOf(AgentArchivedError);
        expect(guides.guides.get(agent.id)?.body.value).toBe('a');
    });

    it('слишком длинное тело: ArgumentInvalidError, запись не меняется', async () => {
        const { save, agent, guides } = setup();
        await expect(
            save.execute({ agentId: agent.id, actorId: 'u1', body: 'x'.repeat(50001) }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        expect(guides.guides.size).toBe(0);
    });
});
