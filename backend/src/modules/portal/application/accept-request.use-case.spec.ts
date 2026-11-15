import { describe, expect, it } from 'vitest';
import { RequestAcceptedEvent } from '../contracts/request-accepted.event';
import {
    AgentArchivedError,
    AgentNotFoundError,
    SkillArchivedError,
    RequestAlreadyDecidedError,
    SkillNotFoundError,
} from '../domain/errors';
import type { Agent } from '../domain/agent';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { AcceptRequestUseCase } from './accept-request.use-case';
import type { RequestView } from './request-view';
import { SubmitRequestUseCase, type SubmitRequestInput } from './submit-request.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    agent: Agent;
    accept: AcceptRequestUseCase;
    submit: SubmitRequestUseCase;
    draft: Omit<SubmitRequestInput, 'authorId'>;
    request: RequestView;
    skill: Skill;
}

async function setup(): Promise<Setup> {
    const fx = createPortalFixture();
    fx.catalog.addProduct('control-center', 'Control Center');
    const agent = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');
    const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
    const accept = new AcceptRequestUseCase(
        fx.requests,
        fx.skills,
        fx.catalog,
        fx.requestQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
    const draft = {
        title: 'Заявка',
        description: 'Описание',
        frequency: { count: 1, period: 'day' },
        minutesPerRun: 10,
        peopleCount: 1,
    };
    const request = await submit.execute({ ...draft, authorId: 'user-1' });
    const skill = Skill.create({
        id: 'skill-1',
        agentId: agent.id,
        name: SkillName.of('Существующий'),
        now: fx.clock.now(),
    });
    await fx.skills.save(skill);
    return { ...fx, agent, accept, submit, draft, request, skill };
}

describe('AcceptRequestUseCase', () => {
    it('привязывает заявку к существующему навыку и пишет событие один раз', async () => {
        const { accept, request, skill, events, skills, requests } = await setup();

        const view = await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            target: { skillId: skill.id },
        });

        expect(view.status).toEqual({ code: 'planned', label: 'Запланировано' });
        expect(view.skill?.id).toBe(skill.id);
        expect(skills.lockedIds).toEqual([skill.id]);
        expect(requests.byId.get(request.id)?.decision).toMatchObject({
            kind: 'accepted',
            skillId: skill.id,
            decidedBy: 'dev-1',
        });
        expect(events.published).toHaveLength(1);
        const event = events.published[0];
        expect(event).toBeInstanceOf(RequestAcceptedEvent);
        expect(event).toMatchObject({
            aggregateId: request.id,
            authorId: 'user-1',
            decidedBy: 'dev-1',
            requestTitle: 'Заявка',
            skillId: skill.id,
            skillName: 'Существующий',
            skillStatus: 'planned',
        });
        expect(events.publishedInTransaction).toEqual([true]);
    });

    it('создаёт навык у агента и привязывает заявку в одной транзакции', async () => {
        const { accept, request, agent, skills, transactions, events } = await setup();

        const view = await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            target: { agentId: agent.id, name: ' Новый навык ', description: 'Описание навыка' },
        });

        expect(skills.byId.size).toBe(2);
        expect(view.skill?.name).toBe('Новый навык');
        expect(view.status.code).toBe('planned');
        expect(transactions.commits).toBe(1);
        expect(events.published).toHaveLength(1);
    });

    it('откатывает всё, если навык создать нельзя (нет агента)', async () => {
        const { accept, request, skills, requests, events, transactions } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                target: { agentId: 'nope', name: 'Навык', description: '' },
            }),
        ).rejects.toBeInstanceOf(AgentNotFoundError);

        expect(skills.byId.size).toBe(1);
        expect(requests.byId.get(request.id)?.decision.kind).toBe('pending');
        expect(events.published).toHaveLength(0);
        expect(transactions.commits).toBe(0);
    });

    it('отвечает SkillNotFoundError для несуществующего навыка без событий', async () => {
        const { accept, request, requests, events } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                target: { skillId: 'nope' },
            }),
        ).rejects.toBeInstanceOf(SkillNotFoundError);

        expect(requests.byId.get(request.id)?.decision.kind).toBe('pending');
        expect(events.published).toHaveLength(0);
    });

    it('на повторное решение отвечает 409 без изменений и без второго события', async () => {
        const { accept, request, skill, events, agent, skills } = await setup();
        await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            target: { skillId: skill.id },
        });

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-2',
                target: { agentId: agent.id, name: 'Ещё навык', description: '' },
            }),
        ).rejects.toBeInstanceOf(RequestAlreadyDecidedError);

        expect(skills.byId.size).toBe(1);
        expect(events.published).toHaveLength(1);
    });

    it('позволяет привязать несколько заявок к одному навыку', async () => {
        const { accept, submit, draft, request, skill, events, requests } = await setup();
        const second = await submit.execute({ ...draft, authorId: 'user-2' });

        for (const id of [request.id, second.id]) {
            await accept.execute({
                requestId: id,
                decidedBy: 'dev-1',
                target: { skillId: skill.id },
            });
        }

        expect(await requests.listLinkedToSkill(skill.id)).toHaveLength(2);
        expect(events.published).toHaveLength(2);
    });

    describe('архив', () => {
        it('архивный навык даёт SkillArchivedError, заявка остаётся pending', async () => {
            const { accept, request, skill, requests, events } = await setup();
            skill.archive(new Date('2026-01-05T00:00:00Z'));

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    target: { skillId: skill.id },
                }),
            ).rejects.toBeInstanceOf(SkillArchivedError);

            expect(requests.byId.get(request.id)?.decision.kind).toBe('pending');
            expect(events.published).toHaveLength(0);
        });

        it('навык архивного агента даёт AgentArchivedError, заявка остаётся pending', async () => {
            const { accept, request, skill, agent, requests, events } = await setup();
            agent.archive(new Date('2026-01-05T00:00:00Z'));

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    target: { skillId: skill.id },
                }),
            ).rejects.toBeInstanceOf(AgentArchivedError);

            expect(requests.byId.get(request.id)?.decision.kind).toBe('pending');
            expect(events.published).toHaveLength(0);
        });

        it('создание навыка у архивного агента даёт AgentArchivedError без навыка', async () => {
            const { accept, request, agent, skills, requests, events } = await setup();
            agent.archive(new Date('2026-01-05T00:00:00Z'));

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    target: { agentId: agent.id, name: 'Новый', description: '' },
                }),
            ).rejects.toBeInstanceOf(AgentArchivedError);

            expect(skills.byId.size).toBe(1);
            expect(requests.byId.get(request.id)?.decision.kind).toBe('pending');
            expect(events.published).toHaveLength(0);
        });

        it('проверяет агента через findAgentForShare', async () => {
            const { accept, request, skill, agent, catalog } = await setup();

            await accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                target: { skillId: skill.id },
            });

            expect(catalog.sharedIds).toEqual([agent.id]);
        });
    });
});
