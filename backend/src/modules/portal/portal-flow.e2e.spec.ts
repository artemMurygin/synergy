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
    InMemoryCatalogRepository,
    InMemoryRequestQuery,
    InMemoryRequestRepository,
    InMemorySkillQuery,
    InMemorySkillRepository,
} from './application/test-doubles';
import { REQUEST_ACCEPTED_EVENT_TYPE } from './contracts/request-accepted.event';
import { SKILL_STATUS_CHANGED_EVENT_TYPE } from './contracts/skill-status-changed.event';
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
        const catalog = new InMemoryCatalogRepository();
        const product = catalog.addProduct('control-center', 'Control Center');
        catalog.agents.set(AGENT_ID, {
            id: AGENT_ID,
            productId: product.id,
            slug: 'assistant',
            name: 'Ассистент',
        });
        const requestQuery = new InMemoryRequestQuery(requests, skills);
        requestQuery.logins.set(ANNA, 'anna');
        requestQuery.profiles.set(ANNA, { lastName: 'Иванова', firstName: 'Анна' });
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
        author: { id: string; login: string; fullName: string };
        total: number;
        items: {
            id: string;
            status: { code: string; label: string };
            author: { id: string; login: string; fullName: string };
        }[];
        skill: { id: string; name: string } | null;
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
        expect(submitted.body.status).toEqual({ code: 'pending', label: 'На рассмотрении' });

        // Сотрудник без роли не видит очередь и не принимает решения.
        expect((await json('GET', '/portal/queue', bearer(ANNA))).status).toBe(403);
        expect(
            (
                await json('POST', `/portal/requests/${requestId}/accept`, bearer(ANNA), {
                    agentId: AGENT_ID,
                    name: 'Сверка актов',
                    description: '',
                })
            ).status,
        ).toBe(403);

        const queue = await json('GET', '/portal/queue', bearer(DEV, ['developer']));
        expect(queue.status).toBe(200);
        expect(queue.body.items.map((item) => item.id)).toEqual([requestId]);
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
                product: { id: 'product-control-center', name: 'Control Center' },
            },
        ]);

        const accepted = await json(
            'POST',
            `/portal/requests/${requestId}/accept`,
            bearer(DEV, ['developer']),
            { agentId: AGENT_ID, name: 'Сверка актов', description: 'Авто-сверка' },
        );
        expect(accepted.status).toBe(200);
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
});
