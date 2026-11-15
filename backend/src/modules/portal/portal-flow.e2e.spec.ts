import { Global, Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { InMemoryTransactionRunner } from '../../database/postgres/testing/in-memory-transaction-runner';
import { TransactionRunnerPort } from '../../database/postgres/transaction-runner.port';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { DomainEventPublisherPort } from '../../shared/ddd';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { OutboxStorePort } from '../../shared/outbox/application/outbox-store.port';
import { OutboxWakeUpPort } from '../../shared/outbox/application/outbox-wake-up.port';
import { Agent } from './domain/agent';
import { OutboxDomainEventPublisher } from '../../shared/outbox/infrastructure/outbox-domain-event-publisher';
import {
    FakeOutboxClock,
    InMemoryOutboxStore,
} from '../../shared/outbox/testing/in-memory-outbox-store';
import { AccessTokenService } from '../auth/domain/ports/access-token-service.port';
import type { Role } from '../auth/domain/role';
import { JwtAccessTokenService } from '../auth/infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../auth/interface/auth-error-status';
import { JwtAuthGuard } from '../auth/interface/http/jwt-auth.guard';
import { RolesGuard } from '../auth/interface/http/roles.guard';
import {
    InMemoryCatalogQuery,
    InMemoryCatalogRepository,
    InMemoryRequestQuery,
    InMemoryRequestRepository,
    InMemorySkillQuery,
    InMemorySkillRepository,
} from './application/test-doubles';
import { REQUEST_ACCEPTED_EVENT_TYPE } from './contracts/request-accepted.event';
import { SKILL_STATUS_CHANGED_EVENT_TYPE } from './contracts/skill-status-changed.event';
import { CatalogQuery } from './domain/ports/catalog-query.port';
import { CatalogRepository } from './domain/ports/catalog-repository.port';
import { RequestQuery } from './domain/ports/request-query.port';
import { RequestRepository } from './domain/ports/request-repository.port';
import { SkillQuery } from './domain/ports/skill-query.port';
import { SkillRepository } from './domain/ports/skill-repository.port';
import { PortalModule } from './portal.module';

const ANNA = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const DEV = '5d2f6c1a-9b8e-4c7d-a1f0-3e4b5c6d7e8f';
const AGENT_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SECRET = 's'.repeat(40);

const fakeLogger = {
    setContext: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
};

const transactions = new InMemoryTransactionRunner();
const outbox = new InMemoryOutboxStore(new FakeOutboxClock(new Date()));

/** Заменяет пул БД: проводка модуля проверяется без базы. */
@Module({
    providers: [{ provide: TransactionRunnerPort, useValue: transactions }],
    exports: [TransactionRunnerPort],
})
class NoDatabaseModule {}

/** То, что даёт глобальный OutboxModule, с хранилищем в памяти. */
@Global()
@Module({
    imports: [NoDatabaseModule],
    providers: [
        DomainEventRegistry,
        { provide: OutboxStorePort, useValue: outbox },
        { provide: OutboxWakeUpPort, useValue: { wake: () => undefined } },
        { provide: DomainEventPublisherPort, useClass: OutboxDomainEventPublisher },
    ],
    exports: [DomainEventRegistry, DomainEventPublisherPort],
})
class OutboxStubModule {}

/** То, что AuthModule даёт остальному приложению: глобальные guard'ы и сервис токенов. */
@Module({
    providers: [
        {
            provide: AccessTokenService,
            useValue: new JwtAccessTokenService({
                secret: SECRET,
                ttlSeconds: 900,
                clock: { now: () => new Date() },
            }),
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: PinoLogger, useValue: fakeLogger },
    ],
    exports: [AccessTokenService],
})
class AuthStubModule {}

describe('portal flow (PortalModule wired end to end)', () => {
    let app: INestApplication;
    let base: string;
    let catalog: InMemoryCatalogRepository;
    const tokens = new JwtAccessTokenService({
        secret: SECRET,
        ttlSeconds: 900,
        clock: { now: () => new Date() },
    });

    const bearer = (userId: string, roles: Role[] = []): Record<string, string> => ({
        authorization: `Bearer ${tokens.sign({ sub: userId, sid: 's1', mcp: false, rol: roles }).token}`,
    });

    beforeAll(async () => {
        registerAuthErrorStatuses();
        const requests = new InMemoryRequestRepository();
        const skills = new InMemorySkillRepository();
        catalog = new InMemoryCatalogRepository();
        const product = catalog.addProduct('control-center', 'Control Center');
        catalog.agents.set(
            AGENT_ID,
            Agent.create({
                id: AGENT_ID,
                slug: 'assistant',
                name: 'Ассистент',
                productIds: [product.id],
                now: new Date(),
            }),
        );
        const requestQuery = new InMemoryRequestQuery(requests, skills);
        requestQuery.logins.set(ANNA, 'anna');
        requestQuery.profiles.set(ANNA, { lastName: 'Иванова', firstName: 'Анна' });
        requestQuery.logins.set(DEV, 'petrov');
        requestQuery.profiles.set(DEV, { lastName: 'Петров', firstName: 'Пётр' });
        const moduleRef = await Test.createTestingModule({
            imports: [AuthStubModule, OutboxStubModule, PortalModule],
        })
            .overrideModule(PostgresModule)
            .useModule(NoDatabaseModule)
            .overrideProvider(RequestRepository)
            .useValue(requests)
            .overrideProvider(SkillRepository)
            .useValue(skills)
            .overrideProvider(CatalogRepository)
            .useValue(catalog)
            .overrideProvider(RequestQuery)
            .useValue(requestQuery)
            .overrideProvider(CatalogQuery)
            .useValue(new InMemoryCatalogQuery(skills, catalog))
            .overrideProvider(SkillQuery)
            .useValue(new InMemorySkillQuery(skills, requests, catalog))
            .compile();
        app = moduleRef.createNestApplication();
        const context = new RequestContextMiddleware();
        app.use(context.use.bind(context));
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
    });

    afterAll(async () => {
        await app.close();
    });

    interface Body {
        id: string;
        status: string | { code: string; label: string };
        archivedAt: string | null;
        nextStatuses: string[];
        products: { id: string; slug: string; name: string }[];
        agents: { id: string; status: { code: string }; skills: { id: string }[] }[];
        author: { id: string; login: string; fullName: string };
        total: number;
        items: {
            id: string;
            status: { code: string; label: string };
            author: { id: string; login: string; fullName: string };
        }[];
        skill: { id: string; name: string } | null;
        reviewer: { id: string; login: string; fullName: string } | null;
        takenAt: string | null;
        effortHours: number | null;
        code: string;
    }

    const json = async (
        method: string,
        path: string,
        headers: Record<string, string>,
        body?: unknown,
    ): Promise<{ status: number; body: Body }> => {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: { ...headers, 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as Body };
    };

    const accept = (
        requestId: string,
        target: unknown,
        effortHours = 8,
        headers: Record<string, string> = bearer(DEV, ['developer']),
    ): ReturnType<typeof json> =>
        json('POST', `/portal/requests/${requestId}/accept`, headers, { effortHours, target });
    const take = (requestId: string): ReturnType<typeof json> =>
        json('POST', `/portal/requests/${requestId}/take`, bearer(DEV, ['developer']));

    const idea = {
        title: 'Сверка актов',
        description: 'Сверяю акты вручную',
        frequency: { count: 5, period: 'week' },
        minutesPerRun: 20,
        peopleCount: 3,
    };

    it('rejects portal routes without a token', async () => {
        for (const [method, path] of [
            ['POST', '/portal/requests'],
            ['GET', '/portal/requests/my'],
            ['GET', '/portal/queue'],
            ['GET', '/portal/agents'],
            ['GET', '/portal/skills'],
        ] as const) {
            const response = await fetch(`${base}${path}`, { method });
            expect(response.status, `${method} ${path}`).toBe(401);
        }
    });

    it('takes an idea from submission to a launched skill, visible to the author at each step', async () => {
        const submitted = await json('POST', '/portal/requests', bearer(ANNA), idea);
        expect(submitted.status).toBe(201);
        const requestId = submitted.body.id;
        expect(submitted.body.status).toEqual({ code: 'new', label: 'Новая' });

        // Сотрудник без роли не видит очередь и не принимает решения.
        expect((await json('GET', '/portal/queue', bearer(ANNA))).status).toBe(403);
        expect(
            (
                await accept(
                    requestId,
                    { kind: 'new_skill', agentId: AGENT_ID, name: 'Сверка актов', description: '' },
                    8,
                    bearer(ANNA),
                )
            ).status,
        ).toBe(403);
        expect((await take(requestId.replace(/^./, '0'))).status).toBe(404);
        expect(
            (await json('POST', `/portal/requests/${requestId}/take`, bearer(ANNA))).status,
        ).toBe(403);

        const queue = await json('GET', '/portal/queue', bearer(DEV, ['developer']));
        expect(queue.status).toBe(200);
        expect(queue.body.items.map((item) => item.id)).toEqual([requestId]);
        expect(queue.body.items[0]?.status.code).toBe('new');
        expect(queue.body.items[0]?.author).toEqual({
            id: ANNA,
            login: 'anna',
            fullName: 'Иванова Анна',
        });
        const card = await json('GET', `/portal/requests/${requestId}`, bearer(DEV, ['developer']));
        expect(card.body.author).toEqual({ id: ANNA, login: 'anna', fullName: 'Иванова Анна' });

        const agents = await fetch(`${base}/portal/agents`, { headers: bearer(ANNA) });
        expect(agents.status).toBe(200);
        expect(await agents.json()).toEqual([
            {
                id: AGENT_ID,
                name: 'Ассистент',
                products: [
                    {
                        id: 'product-control-center',
                        slug: 'control-center',
                        name: 'Control Center',
                    },
                ],
                archivedAt: null,
            },
        ]);

        // Принять из `new` нельзя: сначала взять в работу.
        const early = await accept(requestId, {
            kind: 'new_skill',
            agentId: AGENT_ID,
            name: 'Сверка актов',
            description: '',
        });
        expect(early.status).toBe(409);

        const taken = await take(requestId);
        expect(taken.status).toBe(200);
        expect(taken.body.status).toEqual({ code: 'under_review', label: 'На рассмотрении' });
        expect(taken.body.reviewer).toEqual({ id: DEV, login: 'petrov', fullName: 'Петров Пётр' });
        expect(taken.body.takenAt).not.toBeNull();
        expect((await take(requestId)).status).toBe(409);
        const underReview = await json('GET', '/portal/requests/my', bearer(ANNA));
        expect(underReview.body.items[0]?.status).toEqual({
            code: 'under_review',
            label: 'На рассмотрении',
        });

        // Принятие с новым агентом и новым продуктом; ошибка откатывает всё целиком.
        const bad = await accept(requestId, {
            kind: 'new_agent',
            agent: { name: 'Агент закупок', productIds: [] },
            skill: { name: 'Сверка актов', description: '' },
        });
        expect(bad.status).toBe(400);

        const accepted = await accept(
            requestId,
            {
                kind: 'new_agent',
                agent: { name: 'Агент закупок', productIds: [], newProduct: { name: 'Закупки' } },
                skill: { name: 'Сверка актов', description: 'Авто-сверка' },
            },
            24,
        );
        expect(accepted.status).toBe(200);
        expect(accepted.body.effortHours).toBe(24);
        expect(accepted.body.reviewer?.id).toBe(DEV);
        const author = await json('GET', `/portal/requests/${requestId}`, bearer(ANNA));
        expect(author.body.effortHours).toBe(24);
        expect(author.body.reviewer?.fullName).toBe('Петров Пётр');
        expect((author.body.status as { code: string }).code).toBe('planned');

        const catalogBody = await fetch(`${base}/portal/catalog`, { headers: bearer(ANNA) });
        const tree = (await catalogBody.json()) as {
            products: { slug: string; name: string; agents: { name: string }[] }[];
        };
        const purchases = tree.products.find((p) => p.name === 'Закупки');
        expect(purchases?.slug).toBe('zakupki');
        expect(purchases?.agents.map((a) => a.name)).toEqual(['Агент закупок']);

        // Повторное принятие и принятие под занятым названием.
        expect((await accept(requestId, { kind: 'existing_skill', skillId: 'x' })).status).toBe(
            400,
        );
        const dup = await json('POST', '/portal/requests', bearer(ANNA), idea);
        await take(dup.body.id);
        const clash = await accept(dup.body.id, {
            kind: 'new_agent',
            agent: { name: ' агент ЗАКУПОК ', productIds: [], newProduct: { name: 'Другой' } },
            skill: { name: 'Навык', description: '' },
        });
        expect(clash.status).toBe(409);
        const stillOpen = await json('GET', `/portal/requests/${dup.body.id}`, bearer(ANNA));
        expect((stillOpen.body.status as { code: string }).code).toBe('under_review');
        expect(
            (
                await json(
                    'POST',
                    `/portal/requests/${dup.body.id}/reject`,
                    bearer(DEV, ['developer']),
                    {
                        reason: 'Дубль',
                    },
                )
            ).status,
        ).toBe(200);
        const skillId = accepted.body.skill?.id ?? '';
        expect(skillId).not.toBe('');
        expect(
            [...outbox.events.values()].filter((e) => e.eventType === REQUEST_ACCEPTED_EVENT_TYPE),
        ).toHaveLength(1);

        const labels: [string, string][] = [
            ['planned', 'Запланировано'],
            ['in_dev', 'В разработке'],
            ['testing', 'Тестируется'],
            ['launched', 'Запущено'],
        ];
        for (const [index, [code, label]] of labels.entries()) {
            if (index > 0) {
                const changed = await json(
                    'POST',
                    `/portal/skills/${skillId}/status`,
                    bearer(DEV, ['developer']),
                    { status: code },
                );
                expect(changed.status).toBe(200);
            }
            const mine = await json('GET', '/portal/requests/my', bearer(ANNA));
            expect(mine.status).toBe(200);
            expect(mine.body.items.find((item) => item.id === requestId)?.status).toEqual({
                code,
                label,
            });
        }

        expect(
            [...outbox.events.values()].filter(
                (e) => e.eventType === SKILL_STATUS_CHANGED_EVENT_TYPE,
            ),
        ).toHaveLength(3);

        // Сотрудник без роли не меняет статус, а запущенный навык дальше не двигается.
        const url = `/portal/skills/${skillId}/status`;
        expect((await json('POST', url, bearer(ANNA), { status: 'launched' })).status).toBe(403);
        expect(
            (await json('POST', url, bearer(DEV, ['developer']), { status: 'launched' })).status,
        ).toBe(409);

        const skills = await json(
            'GET',
            '/portal/skills?status=launched',
            bearer(DEV, ['developer']),
        );
        expect(skills.status).toBe(200);
        expect(skills.body.total).toBe(1);

        const queueAfter = await json('GET', '/portal/queue', bearer(DEV, ['developer']));
        expect(queueAfter.body.total).toBe(0);
    });

    describe('catalog, rework and archive', () => {
        const dev = (): Record<string, string> => bearer(DEV, ['developer']);
        let agent2: string;
        let skillId: string;
        let requestId: string;

        interface CatalogBody {
            products: {
                slug: string;
                agents: { id: string; status: { code: string }; skills: { id: string }[] }[];
            }[];
        }
        const catalogOf = async (headers = bearer(ANNA)): Promise<CatalogBody> => {
            const response = await fetch(`${base}/portal/catalog`, { headers });
            expect(response.status).toBe(200);
            return (await response.json()) as CatalogBody;
        };
        const agentIn = (
            body: CatalogBody,
            product: string,
        ): CatalogBody['products'][0]['agents'][0] | undefined =>
            body.products.find((p) => p.slug === product)?.agents.find((a) => a.id === agent2);
        const setStatus = (status: string): ReturnType<typeof json> =>
            json('POST', `/portal/skills/${skillId}/status`, dev(), { status });

        beforeAll(() => {
            const telegram = catalog.addProduct('telegram', 'Telegram-бот');
            const control = catalog.products.get('control-center');
            agent2 = '8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
            catalog.agents.set(
                agent2,
                Agent.create({
                    id: agent2,
                    slug: 'multi',
                    name: 'Мультиагент',
                    productIds: [control?.id ?? '', telegram.id],
                    now: new Date(),
                }),
            );
        });

        it('shows an agent of two products in both catalog branches and once in the agents list', async () => {
            const created = await json('POST', '/portal/skills', dev(), {
                agentId: agent2,
                name: 'Мультинавык',
            });
            expect(created.status).toBe(201);
            skillId = created.body.id;

            const body = await catalogOf();
            for (const slug of ['control-center', 'telegram']) {
                const found = agentIn(body, slug);
                expect(found?.status.code, slug).toBe('in_development');
                expect(
                    found?.skills.map((s) => s.id),
                    slug,
                ).toEqual([skillId]);
            }

            const agents = await fetch(`${base}/portal/agents`, { headers: bearer(ANNA) });
            const list = (await agents.json()) as { id: string; products: { slug: string }[] }[];
            const matches = list.filter((a) => a.id === agent2);
            expect(matches).toHaveLength(1);
            expect(matches[0]?.products.map((p) => p.slug)).toEqual(['control-center', 'telegram']);
        });

        it('moves a skill testing -> launched -> rework -> testing, the agent stays working, the author sees the label', async () => {
            const submitted = await json('POST', '/portal/requests', bearer(ANNA), idea);
            requestId = submitted.body.id;
            await take(requestId);
            const accepted = await accept(requestId, { kind: 'existing_skill', skillId });
            expect(accepted.status).toBe(200);

            for (const status of ['in_dev', 'testing', 'launched']) {
                expect((await setStatus(status)).status, status).toBe(200);
            }
            expect(agentIn(await catalogOf(), 'telegram')?.status.code).toBe('working');

            const rework = await setStatus('rework');
            expect(rework.status).toBe(200);
            expect(rework.body.nextStatuses).toEqual(['testing']);
            expect(agentIn(await catalogOf(), 'telegram')?.status.code).toBe('working');
            const mine = await json('GET', '/portal/requests/my', bearer(ANNA));
            expect(mine.body.items.find((item) => item.id === requestId)?.status).toEqual({
                code: 'rework',
                label: 'Доработка',
            });

            expect((await setStatus('testing')).status).toBe(200);
            expect(agentIn(await catalogOf(), 'telegram')?.status.code).toBe('working');
            const listed = await json('GET', '/portal/skills?status=testing', dev());
            expect(listed.body.items.map((i) => i.id)).toContain(skillId);
        });

        it('hides an archived skill, and agent restore does not bring it back', async () => {
            const archived = await json('POST', `/portal/skills/${skillId}/archive`, dev());
            expect(archived.status).toBe(200);
            expect(archived.body.archivedAt).not.toBeNull();
            expect(agentIn(await catalogOf(), 'telegram')?.skills).toEqual([]);
            const listed = await json('GET', '/portal/skills', dev());
            expect(listed.body.items.map((i) => i.id)).not.toContain(skillId);
            // Автор по-прежнему видит последний статус заявки.
            const mine = await json('GET', '/portal/requests/my', bearer(ANNA));
            expect(mine.body.items.find((item) => item.id === requestId)?.status.code).toBe(
                'testing',
            );

            expect((await json('POST', `/portal/agents/${agent2}/archive`, dev())).status).toBe(
                200,
            );
            expect(agentIn(await catalogOf(), 'control-center')).toBeUndefined();
            expect(agentIn(await catalogOf(), 'telegram')).toBeUndefined();
            const archive = await json('GET', '/portal/archive', dev());
            expect(archive.status).toBe(200);

            expect((await json('POST', `/portal/agents/${agent2}/restore`, dev())).status).toBe(
                200,
            );
            expect(agentIn(await catalogOf(), 'telegram')?.skills).toEqual([]);

            expect((await json('POST', `/portal/skills/${skillId}/restore`, dev())).status).toBe(
                200,
            );
            expect(agentIn(await catalogOf(), 'telegram')?.skills.map((s) => s.id)).toEqual([
                skillId,
            ]);
        });

        it('rejects archiving routes for an employee and answers 409 when accepting into an archived skill', async () => {
            expect(
                (await json('POST', `/portal/skills/${skillId}/archive`, bearer(ANNA))).status,
            ).toBe(403);
            expect(
                (await json('POST', `/portal/agents/${agent2}/archive`, bearer(ANNA))).status,
            ).toBe(403);
            expect((await json('GET', '/portal/archive', bearer(ANNA))).status).toBe(403);

            await json('POST', `/portal/skills/${skillId}/archive`, dev());
            const second = await json('POST', '/portal/requests', bearer(ANNA), idea);
            await take(second.body.id);
            const accepted = await accept(second.body.id, { kind: 'existing_skill', skillId });
            expect(accepted.status).toBe(409);
            const queue = await json('GET', '/portal/queue', dev());
            expect(queue.body.items.map((i) => i.id)).toContain(second.body.id);
            expect((await setStatus('launched')).status).toBe(409);
        });
    });
});
