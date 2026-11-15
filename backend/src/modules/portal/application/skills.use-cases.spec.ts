import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { AgentArchivedError, AgentNotFoundError } from '../domain/errors';
import { Frequency } from '../domain/frequency';
import { IdeaRequest } from '../domain/idea-request';
import { RequestTitle } from '../domain/request-title';
import { CreateSkillUseCase } from './create-skill.use-case';
import { ListSkillsUseCase } from './list-skills.use-case';
import type { Agent } from '../domain/agent';
import { toSkillView } from './skill-view';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    tasks: Agent;
    audit: Agent;
    create: CreateSkillUseCase;
    list: ListSkillsUseCase;
}

function setup(): Setup {
    const fx = createPortalFixture();
    fx.catalog.addProduct('control-center', 'Control Center');
    fx.catalog.addProduct('manager-helper', 'Manager Helper');
    const tasks = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');
    const audit = fx.catalog.addAgent('manager-helper', 'audit', 'Аудит сделок');
    return {
        ...fx,
        tasks,
        audit,
        create: new CreateSkillUseCase(fx.skills, fx.catalog, fx.skillQuery, fx.clock),
        list: new ListSkillsUseCase(fx.skillQuery),
    };
}

describe('CreateSkillUseCase', () => {
    it('создаёт навык в статусе planned у агента', async () => {
        const { create, tasks, skills, clock } = setup();

        const view = await create.execute({
            agentId: tasks.id,
            name: ' Напоминания ',
            description: 'Описание',
        });

        expect(view.status).toBe('planned');
        expect(view.name).toBe('Напоминания');
        expect(view.agent.id).toBe(tasks.id);
        expect(view.products.map((p) => p.name)).toEqual(['Control Center']);
        expect(view.statusChangedAt).toEqual(clock.now());
        expect(view.nextStatuses).toEqual(['in_dev']);
        expect(skills.byId.size).toBe(1);
    });

    it('отвергает название из пробелов без создания', async () => {
        const { create, tasks, skills } = setup();

        await expect(
            create.execute({ agentId: tasks.id, name: '   ', description: '' }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        expect(skills.byId.size).toBe(0);
    });

    it('отвечает AgentNotFoundError для несуществующего агента', async () => {
        const { create, skills } = setup();

        await expect(
            create.execute({ agentId: 'nope', name: 'Навык', description: '' }),
        ).rejects.toBeInstanceOf(AgentNotFoundError);
        expect(skills.byId.size).toBe(0);
    });
});

describe('CreateSkillUseCase, архив', () => {
    it('создание навыка у архивного агента даёт AgentArchivedError без навыка', async () => {
        const { create, tasks, skills } = setup();
        tasks.archive(new Date('2026-01-05T00:00:00Z'));

        await expect(
            create.execute({ agentId: tasks.id, name: 'Навык', description: '' }),
        ).rejects.toBeInstanceOf(AgentArchivedError);
        expect(skills.byId.size).toBe(0);
    });
});

describe('ListSkillsUseCase', () => {
    it('фильтрует по статусу и возвращает агента, продукт и число заявок', async () => {
        const { create, list, tasks, audit, skills } = setup();
        const planned = await create.execute({ agentId: tasks.id, name: 'А', description: '' });
        const other = await create.execute({ agentId: audit.id, name: 'Б', description: '' });
        skills.byId.get(other.id)?.changeStatus('in_dev', new Date('2026-02-02T10:00:00Z'));

        const all = await list.execute({ limit: 10, page: 0 });
        expect(all.total).toBe(2);

        const onlyPlanned = await list.execute({ status: 'planned', limit: 10, page: 0 });
        expect(onlyPlanned.items.map((item) => item.id)).toEqual([planned.id]);
        expect(onlyPlanned.items[0]).toMatchObject({
            agent: { id: tasks.id, name: 'Задачи' },
            products: [{ name: 'Control Center' }],
            linkedRequestCount: 0,
            nextStatuses: ['in_dev'],
        });
        expect(all.items.find((item) => item.id === other.id)?.nextStatuses).toEqual(['testing']);
    });

    it('считает привязанные заявки', async () => {
        const { create, list, tasks, requests } = setup();
        const skill = await create.execute({ agentId: tasks.id, name: 'А', description: '' });
        for (const id of ['r1', 'r2']) {
            const request = IdeaRequest.create({
                id,
                authorId: 'u',
                title: RequestTitle.of('T'),
                description: 'D',
                frequency: Frequency.of(1, 'day'),
                minutesPerRun: 1,
                peopleCount: 1,
                now: new Date(),
            });
            request.accept(skill.id, 'dev', new Date());
            await requests.save(request);
        }

        const page = await list.execute({ limit: 10, page: 0 });

        expect(page.items[0]?.linkedRequestCount).toBe(2);
    });
});

describe('toSkillView', () => {
    it.each([
        ['planned', ['in_dev']],
        ['testing', ['launched', 'rework']],
        ['launched', ['rework']],
        ['rework', ['testing']],
    ] as const)('для статуса %s отдаёт nextStatuses из SkillStatus.allowedNext', (status, next) => {
        const row = {
            id: 's',
            name: 'N',
            description: '',
            status,
            agent: { id: 'a', name: 'A' },
            products: [{ id: 'p', slug: 'p', name: 'P' }],
            launchedAt: null,
            archivedAt: null,
            linkedRequestCount: 0,
            createdAt: new Date(),
            statusChangedAt: new Date(),
        };

        expect(toSkillView(row).nextStatuses).toEqual(next);
    });
});
