import { describe, expect, it, vi } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { RequestAcceptedEvent } from '../contracts/request-accepted.event';
import type { Agent } from '../domain/agent';
import {
    AgentArchivedError,
    AgentNameTakenError,
    AgentNotFoundError,
    ProductNameTakenError,
    ProductNotFoundError,
    RequestAlreadyDecidedError,
    RequestNotTakenError,
    SkillArchivedError,
    SkillNotFoundError,
    SlugTakenError,
} from '../domain/errors';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { AcceptRequestUseCase, type AcceptTarget } from './accept-request.use-case';
import type { RequestView } from './request-view';
import { SubmitRequestUseCase, type SubmitRequestInput } from './submit-request.use-case';
import { TakeRequestUseCase } from './take-request.use-case';
import { InMemoryCatalogRepository, createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    agent: Agent;
    accept: AcceptRequestUseCase;
    submit: SubmitRequestUseCase;
    take: TakeRequestUseCase;
    draft: Omit<SubmitRequestInput, 'authorId'>;
    request: RequestView;
    skill: Skill;
}

async function setup(): Promise<Setup> {
    const fx = createPortalFixture();
    fx.catalog.addProduct('control-center', 'Control Center');
    const agent = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');
    const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
    const take = new TakeRequestUseCase(
        fx.requests,
        fx.requestQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
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
    await take.execute({ requestId: request.id, reviewerId: 'dev-1' });
    fx.events.published = [];
    fx.events.publishedInTransaction.length = 0;
    const skill = Skill.create({
        id: 'skill-1',
        agentId: agent.id,
        name: SkillName.of('Существующий'),
        now: fx.clock.now(),
    });
    await fx.skills.save(skill);
    return { ...fx, agent, accept, submit, take, draft, request, skill };
}

const existing = (skillId: string): AcceptTarget => ({ kind: 'existing_skill', skillId });

describe('AcceptRequestUseCase: existing_skill', () => {
    it('привязывает заявку к существующему навыку, сохраняет оценку и пишет событие один раз', async () => {
        const { accept, request, skill, events, skills, requests } = await setup();

        const view = await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-2',
            effortHours: 16,
            target: existing(skill.id),
        });

        expect(view.status).toEqual({ code: 'planned', label: 'Запланировано' });
        expect(view.skill?.id).toBe(skill.id);
        expect(view.effortHours).toBe(16);
        expect(skills.lockedIds).toEqual([skill.id]);
        expect(requests.byId.get(request.id)?.decision).toMatchObject({
            kind: 'accepted',
            skillId: skill.id,
            reviewerId: 'dev-1',
            decidedBy: 'dev-2',
            effortHours: 16,
        });
        expect(events.published).toHaveLength(1);
        const event = events.published[0];
        expect(event).toBeInstanceOf(RequestAcceptedEvent);
        expect(event).toMatchObject({
            aggregateId: request.id,
            authorId: 'user-1',
            decidedBy: 'dev-2',
            requestTitle: 'Заявка',
            skillId: skill.id,
            skillName: 'Существующий',
            skillStatus: 'planned',
            effortHours: 16,
        });
        expect(events.publishedInTransaction).toEqual([true]);
    });

    it('сохраняет решение условным обновлением из under_review', async () => {
        const { accept, request, skill, requests } = await setup();
        const save = vi.spyOn(requests, 'save');

        await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 4,
            target: existing(skill.id),
        });

        expect(save).toHaveBeenCalledWith(expect.anything(), 'under_review');
    });

    it('заявка в статусе new даёт 409 без записей в каталог и без события', async () => {
        const { accept, submit, draft, skill, agent, skills, catalog, events } = await setup();
        const fresh = await submit.execute({ ...draft, authorId: 'user-2' });
        const agentsBefore = catalog.agents.size;

        await expect(
            accept.execute({
                requestId: fresh.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: existing(skill.id),
            }),
        ).rejects.toBeInstanceOf(RequestNotTakenError);
        await expect(
            accept.execute({
                requestId: fresh.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: {
                    kind: 'new_agent',
                    agent: { name: 'Новый', productIds: [], newProduct: { name: 'Продукт' } },
                    skill: { name: 'Навык', description: '' },
                },
            }),
        ).rejects.toBeInstanceOf(RequestNotTakenError);
        await expect(
            accept.execute({
                requestId: fresh.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: { kind: 'new_skill', agentId: agent.id, name: 'Навык', description: '' },
            }),
        ).rejects.toBeInstanceOf(RequestNotTakenError);

        expect(catalog.agents.size).toBe(agentsBefore);
        expect(catalog.products.size).toBe(1);
        expect(skills.byId.size).toBe(1);
        expect(events.published).toHaveLength(0);
    });

    it.each([0, -1, 2001, 1.5, Number.NaN])(
        'неверная оценка %s даёт 400 без изменений',
        async (effortHours) => {
            const { accept, request, skill, requests, events } = await setup();

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    effortHours,
                    target: existing(skill.id),
                }),
            ).rejects.toBeInstanceOf(ArgumentInvalidError);

            expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
            expect(events.published).toHaveLength(0);
        },
    );

    it('отвечает SkillNotFoundError для несуществующего навыка без событий', async () => {
        const { accept, request, requests, events } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: existing('nope'),
            }),
        ).rejects.toBeInstanceOf(SkillNotFoundError);

        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });

    it('на повторное решение отвечает 409 без изменений и без второго события', async () => {
        const { accept, request, skill, events, agent, skills } = await setup();
        await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 8,
            target: existing(skill.id),
        });

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-2',
                effortHours: 8,
                target: {
                    kind: 'new_skill',
                    agentId: agent.id,
                    name: 'Ещё навык',
                    description: '',
                },
            }),
        ).rejects.toBeInstanceOf(RequestAlreadyDecidedError);

        expect(skills.byId.size).toBe(1);
        expect(events.published).toHaveLength(1);
    });

    it('позволяет привязать несколько заявок к одному навыку', async () => {
        const { accept, submit, take, draft, request, skill, events, requests } = await setup();
        const second = await submit.execute({ ...draft, authorId: 'user-2' });
        await take.execute({ requestId: second.id, reviewerId: 'dev-1' });
        events.published = [];

        for (const id of [request.id, second.id]) {
            await accept.execute({
                requestId: id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: existing(skill.id),
            });
        }

        expect(await requests.listLinkedToSkill(skill.id)).toHaveLength(2);
        expect(events.published).toHaveLength(2);
    });

    describe('архив', () => {
        it('архивный навык даёт SkillArchivedError, заявка остаётся under_review', async () => {
            const { accept, request, skill, requests, events } = await setup();
            skill.archive(new Date('2026-01-05T00:00:00Z'));

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    effortHours: 8,
                    target: existing(skill.id),
                }),
            ).rejects.toBeInstanceOf(SkillArchivedError);

            expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
            expect(events.published).toHaveLength(0);
        });

        it('навык архивного агента даёт AgentArchivedError, заявка остаётся under_review', async () => {
            const { accept, request, skill, agent, requests, events } = await setup();
            agent.archive(new Date('2026-01-05T00:00:00Z'));

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    effortHours: 8,
                    target: existing(skill.id),
                }),
            ).rejects.toBeInstanceOf(AgentArchivedError);

            expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
            expect(events.published).toHaveLength(0);
        });

        it('проверяет агента через findAgentForShare', async () => {
            const { accept, request, skill, agent, catalog } = await setup();

            await accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: existing(skill.id),
            });

            expect(catalog.sharedIds).toEqual([agent.id]);
        });
    });
});

describe('AcceptRequestUseCase: new_skill', () => {
    it('создаёт навык у агента и привязывает заявку в одной транзакции', async () => {
        const { accept, request, agent, skills, transactions, events } = await setup();

        const view = await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 8,
            target: {
                kind: 'new_skill',
                agentId: agent.id,
                name: ' Новый навык ',
                description: 'Описание навыка',
            },
        });

        expect(skills.byId.size).toBe(2);
        expect(view.skill?.name).toBe('Новый навык');
        expect(view.status.code).toBe('planned');
        expect(transactions.commits).toBe(2);
        expect(events.published).toHaveLength(1);
    });

    it('откатывает всё, если навык создать нельзя (нет агента)', async () => {
        const { accept, request, skills, requests, events } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: { kind: 'new_skill', agentId: 'nope', name: 'Навык', description: '' },
            }),
        ).rejects.toBeInstanceOf(AgentNotFoundError);

        expect(skills.byId.size).toBe(1);
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });

    it('создание навыка у архивного агента даёт AgentArchivedError без навыка', async () => {
        const { accept, request, agent, skills, requests, events } = await setup();
        agent.archive(new Date('2026-01-05T00:00:00Z'));

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: { kind: 'new_skill', agentId: agent.id, name: 'Новый', description: '' },
            }),
        ).rejects.toBeInstanceOf(AgentArchivedError);

        expect(skills.byId.size).toBe(1);
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });
});

describe('AcceptRequestUseCase: new_agent', () => {
    const newAgent = (
        agent: { name: string; productIds: string[]; newProduct?: { name: string } },
        skillName = 'Первый навык',
    ): AcceptTarget => ({
        kind: 'new_agent',
        agent,
        skill: { name: skillName, description: 'Описание' },
    });

    it('создаёт агента по существующим продуктам и навык planned, заявку принимает', async () => {
        const { accept, request, catalog, skills, events } = await setup();
        const productId = catalog.products.get('control-center')?.id ?? '';

        const view = await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 24,
            target: newAgent({ name: ' Агент продаж ', productIds: [productId] }),
        });

        const created = [...catalog.agents.values()].find((a) => a.name === 'Агент продаж');
        expect(created?.slug).toBe('agent-prodazh');
        expect(created?.productIds).toEqual([productId]);
        expect(skills.byId.size).toBe(2);
        expect(view.status.code).toBe('planned');
        expect(view.skill?.name).toBe('Первый навык');
        expect(view.effortHours).toBe(24);
        expect(events.published).toHaveLength(1);
        expect(events.published[0]).toMatchObject({ effortHours: 24, skillStatus: 'planned' });
    });

    it('с newProduct создаёт продукт и связывает агента с ним и с выбранными', async () => {
        const { accept, request, catalog } = await setup();
        const productId = catalog.products.get('control-center')?.id ?? '';

        await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 8,
            target: newAgent({
                name: 'Агент',
                productIds: [productId],
                newProduct: { name: 'Новый продукт' },
            }),
        });

        const product = [...catalog.products.values()].find((p) => p.name === 'Новый продукт');
        expect(product?.slug).toBe('novyy-produkt');
        const created = [...catalog.agents.values()].find((a) => a.name === 'Агент');
        expect(created?.productIds).toEqual([productId, product?.id]);
    });

    it('только с newProduct (без productIds) создаёт агента с одним новым продуктом', async () => {
        const { accept, request, catalog } = await setup();

        await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 8,
            target: newAgent({ name: 'Агент', productIds: [], newProduct: { name: 'Новый' } }),
        });

        const product = [...catalog.products.values()].find((p) => p.name === 'Новый');
        const created = [...catalog.agents.values()].find((a) => a.name === 'Агент');
        expect(created?.productIds).toEqual([product?.id]);
    });

    it('подбирает свободный slug с суффиксом при совпадении', async () => {
        const { accept, request, catalog } = await setup();
        catalog.addAgent('control-center', 'agent', 'Другой агент');

        await accept.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            effortHours: 8,
            target: newAgent({
                name: 'Agent',
                productIds: [catalog.products.get('control-center')?.id ?? ''],
            }),
        });

        const created = [...catalog.agents.values()].find((a) => a.name === 'Agent');
        expect(created?.slug).toBe('agent-2');
    });

    it('несуществующий продукт даёт ProductNotFoundError, ничего не создано', async () => {
        const { accept, request, catalog, skills, requests, events } = await setup();
        const productId = catalog.products.get('control-center')?.id ?? '';

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({ name: 'Агент', productIds: [productId, 'missing'] }),
            }),
        ).rejects.toBeInstanceOf(ProductNotFoundError);

        expect(catalog.agents.size).toBe(1);
        expect(catalog.products.size).toBe(1);
        expect(skills.byId.size).toBe(1);
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });

    it('занятое название агента (без учёта регистра и пробелов) даёт 409, продукт не создан', async () => {
        const { accept, request, catalog, requests, events } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({
                    name: '  ЗАДАЧИ ',
                    productIds: [],
                    newProduct: { name: 'Новый продукт' },
                }),
            }),
        ).rejects.toBeInstanceOf(AgentNameTakenError);

        expect(catalog.products.size).toBe(1);
        expect(catalog.agents.size).toBe(1);
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });

    it('занятое название продукта даёт ProductNameTakenError', async () => {
        const { accept, request, catalog, requests, events } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({
                    name: 'Агент',
                    productIds: [],
                    newProduct: { name: 'control center' },
                }),
            }),
        ).rejects.toBeInstanceOf(ProductNameTakenError);

        expect(catalog.agents.size).toBe(1);
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });

    it('пустое название агента или навыка даёт 400 без записей', async () => {
        const { accept, request, catalog, skills } = await setup();
        const productId = catalog.products.get('control-center')?.id ?? '';

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({ name: '   ', productIds: [productId] }),
            }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({ name: 'Агент', productIds: [productId] }, '  '),
            }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);

        expect(catalog.agents.size).toBe(1);
        expect(skills.byId.size).toBe(1);
    });

    it('без продуктов вообще даёт 400', async () => {
        const { accept, request, catalog } = await setup();

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({ name: 'Агент', productIds: [] }),
            }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);

        expect(catalog.agents.size).toBe(1);
    });

    it('любая ошибка после вставки откатывает агента и продукт, заявка остаётся under_review', async () => {
        const { accept, request, catalog, skills, requests, events } = await setup();
        vi.spyOn(skills, 'save').mockRejectedValue(new Error('boom'));

        await expect(
            accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: newAgent({ name: 'Агент', productIds: [], newProduct: { name: 'Новый' } }),
            }),
        ).rejects.toThrow('boom');

        expect(catalog.agents.size).toBe(1);
        expect(catalog.products.size).toBe(1);
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(0);
    });

    describe('гонка за slug', () => {
        interface FlakySetup extends PortalFixture {
            catalog: FlakyCatalog;
            accept: AcceptRequestUseCase;
            request: RequestView;
        }

        class FlakyCatalog extends InMemoryCatalogRepository {
            agentFailures = 0;

            insertAttempts = 0;

            override insertAgent(agent: Agent): Promise<void> {
                this.insertAttempts += 1;
                if (this.agentFailures > 0) {
                    this.agentFailures -= 1;
                    return Promise.reject(new SlugTakenError());
                }
                return super.insertAgent(agent);
            }
        }

        async function flaky(failures: number): Promise<FlakySetup> {
            const fx = createPortalFixture();
            const catalog = new FlakyCatalog();
            catalog.addProduct('p', 'Продукт');
            const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
            const take = new TakeRequestUseCase(
                fx.requests,
                fx.requestQuery,
                fx.clock,
                fx.transactions,
                fx.events,
            );
            const accept = new AcceptRequestUseCase(
                fx.requests,
                fx.skills,
                catalog,
                fx.requestQuery,
                fx.clock,
                fx.transactions,
                fx.events,
            );
            const request = await submit.execute({
                authorId: 'user-1',
                title: 'Заявка',
                description: 'Описание',
                frequency: { count: 1, period: 'day' },
                minutesPerRun: 10,
                peopleCount: 1,
            });
            await take.execute({ requestId: request.id, reviewerId: 'dev-1' });
            catalog.agentFailures = failures;
            return { ...fx, catalog, accept, request };
        }

        const target = (catalog: FlakyCatalog): AcceptTarget => ({
            kind: 'new_agent',
            agent: { name: 'Агент', productIds: [catalog.products.get('p')?.id ?? ''] },
            skill: { name: 'Навык', description: '' },
        });

        it('повторяет подбор slug и успевает на третьей попытке', async () => {
            const { accept, request, catalog, events } = await flaky(2);

            const view = await accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: target(catalog),
            });

            expect(catalog.insertAttempts).toBe(3);
            expect(view.status.code).toBe('planned');
            expect(catalog.agents.size).toBe(1);
            expect(events.published.filter((e) => e instanceof RequestAcceptedEvent)).toHaveLength(
                1,
            );
        });

        it('вставку slug выполняет в savepoint', async () => {
            const { accept, request, catalog, transactions } = await flaky(0);
            const spy = vi.spyOn(transactions, 'savepoint');

            await accept.execute({
                requestId: request.id,
                decidedBy: 'dev-1',
                effortHours: 8,
                target: target(catalog),
            });

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('после трёх неудач отдаёт SlugTakenError, ничего не создано', async () => {
            const { accept, request, catalog, requests, events } = await flaky(3);

            await expect(
                accept.execute({
                    requestId: request.id,
                    decidedBy: 'dev-1',
                    effortHours: 8,
                    target: target(catalog),
                }),
            ).rejects.toBeInstanceOf(SlugTakenError);

            expect(catalog.insertAttempts).toBe(3);
            expect(catalog.agents.size).toBe(0);
            expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
            expect(events.published.filter((e) => e instanceof RequestAcceptedEvent)).toHaveLength(
                0,
            );
        });
    });
});
