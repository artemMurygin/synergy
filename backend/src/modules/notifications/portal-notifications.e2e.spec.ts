import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenService } from '../auth/domain/ports/access-token-service.port';
import type { Role } from '../auth/domain/role';
import { JwtAccessTokenService } from '../auth/infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../auth/interface/auth-error-status';
import { JwtAuthGuard } from '../auth/interface/http/jwt-auth.guard';
import { RolesGuard } from '../auth/interface/http/roles.guard';
import { PortalModule } from '../portal/portal.module';
import { NotificationsModule } from './notifications.module';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const SECRET = 's'.repeat(40);
const IDLE_DEADLINE_MS = 8_000;

const tokens = new JwtAccessTokenService({
    secret: SECRET,
    ttlSeconds: 900,
    clock: { now: () => new Date() },
});

@Module({
    providers: [
        { provide: AccessTokenService, useValue: tokens },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
    exports: [AccessTokenService],
})
class AuthStubModule {}

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StoredNotification {
    type: string;
    title: string;
    body: string;
    target_type: string;
    target_id: string;
    actor_id: string | null;
    recipient_id: string;
}

describe.skipIf(adminUrl === undefined)('portal notifications (modules wired end to end)', () => {
    const databaseName = `portal_notifications_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let app: INestApplication;
    let client: Client;
    let base: string;
    let anna: string;
    let boris: string;
    let dev: string;
    let agentId: string;

    const bearer = (userId: string, roles: Role[] = []): Record<string, string> => ({
        authorization: `Bearer ${tokens.sign({ sub: userId, sid: 's1', mcp: false, rol: roles }).token}`,
    });

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    async function post(
        path: string,
        userId: string,
        roles: Role[],
        body: unknown,
    ): Promise<Record<string, unknown>> {
        const response = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { ...bearer(userId, roles), 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        expect(response.status, path).toBeLessThan(300);
        return (await response.json()) as Record<string, unknown>;
    }

    const submit = async (author: string, title: string): Promise<string> => {
        const created = await post('/portal/requests', author, [], {
            title,
            description: 'Описание',
            frequency: { count: 1, period: 'day' },
            minutesPerRun: 10,
            peopleCount: 1,
        });
        return String(created.id);
    };

    const take = (requestId: string, by: string): Promise<Record<string, unknown>> =>
        post(`/portal/requests/${requestId}/take`, by, ['developer'], {});

    /** Принятие по новой схеме: заявку сначала берут в работу, затем принимают с оценкой. */
    const accept = async (
        requestId: string,
        by: string,
        target: unknown,
    ): Promise<Record<string, unknown>> => {
        await take(requestId, by);
        return post(`/portal/requests/${requestId}/accept`, by, ['developer'], {
            effortHours: 8,
            target,
        });
    };

    const newSkill = (name: string): unknown => ({
        kind: 'new_skill',
        agentId,
        name,
        description: '',
    });
    const existingSkill = (skillId: string): unknown => ({ kind: 'existing_skill', skillId });

    const changeStatus = (skillId: string, by: string, status: string): Promise<unknown> =>
        post(`/portal/skills/${skillId}/status`, by, ['developer'], { status });

    async function waitForOutboxIdle(): Promise<void> {
        const deadline = Date.now() + IDLE_DEADLINE_MS;
        await pause(150);
        while (Date.now() < deadline) {
            const result = await client.query<{ pending: string }>(
                "SELECT count(*) AS pending FROM outbox_deliveries WHERE status <> 'done'",
            );
            if (result.rows[0]?.pending === '0') return;
            await pause(50);
        }
        throw new Error('Outbox deliveries were not processed in time');
    }

    async function stored(type: string): Promise<StoredNotification[]> {
        const result = await client.query<StoredNotification>(
            `SELECT type, title, body, target_type, target_id, actor_id::text, recipient_id::text
             FROM notifications WHERE type = $1 ORDER BY created_at, target_id`,
            [type],
        );
        return result.rows;
    }

    async function replayPortalEvents(): Promise<void> {
        await client.query(
            `UPDATE outbox_deliveries d
             SET status = 'pending', next_attempt_at = now(), processed_at = NULL
             FROM outbox_events e
             WHERE e.id = d.event_id AND e.event_type LIKE 'portal.%'`,
        );
        await waitForOutboxIdle();
    }

    beforeAll(async () => {
        if (adminUrl === undefined) return;
        registerAuthErrorStatuses();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl, databaseName);
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    ignoreEnvFile: true,
                    ignoreEnvVars: true,
                    load: [
                        () => ({
                            NODE_ENV: 'test',
                            POSTGRES_URL: databaseUrl,
                            OUTBOX_POLL_INTERVAL_MS: 100,
                            OUTBOX_BATCH_SIZE: 20,
                            OUTBOX_MAX_ATTEMPTS: 5,
                            OUTBOX_RETENTION_DAYS: 7,
                            AUTH_ALLOWED_ORIGINS: [],
                            NOTIFICATIONS_WS_PING_INTERVAL_MS: 20_000,
                        }),
                    ],
                }),
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                OutboxModule,
                PortalModule,
                NotificationsModule,
            ],
            providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
        })
            .overrideModule(AuthModule)
            .useModule(AuthStubModule)
            .compile();
        app = moduleRef.createNestApplication({ logger: false });
        const requestContext = new RequestContextMiddleware();
        app.use(requestContext.use.bind(requestContext));
        app.useWebSocketAdapter(new IoAdapter(app));
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
        client = new Client({ connectionString: databaseUrl });
        await client.connect();
        anna = await addUser('anna');
        boris = await addUser('boris');
        dev = await addUser('petrov');
        const product = await client.query<{ id: string }>(
            "INSERT INTO portal_products (slug, name) VALUES ('cc', 'Control Center') RETURNING id",
        );
        const agent = await client.query<{ id: string }>(
            "INSERT INTO portal_agents (slug, name) VALUES ('assistant', 'Ассистент') RETURNING id",
        );
        agentId = agent.rows[0]?.id ?? '';
        await client.query(
            'INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)',
            [agentId, product.rows[0]?.id],
        );
    }, 60_000);

    afterAll(async () => {
        await app.close();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    it('tells the author about an accepted request once, even when the event is handled again', async () => {
        const requestId = await submit(anna, 'Сверка актов');

        await accept(requestId, dev, newSkill('Сверка актов'));
        await waitForOutboxIdle();
        await replayPortalEvents();

        const accepted = (await stored('request.accepted')).filter(
            (n) => n.target_id === requestId,
        );
        expect(accepted).toHaveLength(1);
        expect(accepted[0]).toMatchObject({
            recipient_id: anna,
            target_type: 'request',
            actor_id: dev,
        });
        expect(accepted[0]?.body).toContain('Сверка актов');
        expect(accepted[0]?.body).toContain('Запланировано');
    });

    it('tells the author when a developer takes the request, once even when replayed', async () => {
        const requestId = await submit(anna, 'Взятие в работу');

        await take(requestId, dev);
        await waitForOutboxIdle();
        await replayPortalEvents();

        const taken = (await stored('request.under-review')).filter(
            (n) => n.target_id === requestId,
        );
        expect(taken).toHaveLength(1);
        expect(taken[0]).toMatchObject({
            recipient_id: anna,
            target_type: 'request',
            actor_id: dev,
        });
        expect(taken[0]?.body).toContain('Взятие в работу');
    });

    it('does not notify a developer who takes their own request', async () => {
        const requestId = await submit(dev, 'Своя заявка в работу');

        await take(requestId, dev);
        await waitForOutboxIdle();

        const own = (await stored('request.under-review')).filter((n) => n.target_id === requestId);
        expect(own).toEqual([]);
    });

    it('serves a backend response the portal fixture can parse (take, then accept with a new agent)', async () => {
        const requestId = await submit(anna, 'Фикстура портала');

        const taken = await take(requestId, dev);
        expect(taken).toMatchObject({
            status: { code: 'under_review', label: 'На рассмотрении' },
            reviewer: { id: dev },
            effortHours: null,
        });
        expect(typeof taken.takenAt).toBe('string');

        const decided = await post(`/portal/requests/${requestId}/accept`, dev, ['developer'], {
            effortHours: 24,
            target: {
                kind: 'new_agent',
                agent: {
                    name: 'Новый агент контракта',
                    productIds: [],
                    newProduct: { name: 'Новый продукт контракта' },
                },
                skill: { name: 'Навык контракта', description: 'Описание' },
            },
        });
        expect(decided).toMatchObject({
            status: { code: 'planned' },
            effortHours: 24,
            reviewer: { id: dev },
        });
        await waitForOutboxIdle();
        const accepted = (await stored('request.accepted')).filter(
            (n) => n.target_id === requestId,
        );
        expect(accepted).toHaveLength(1);
        expect(accepted[0]?.recipient_id).toBe(anna);
    });

    it('tells the author about a rejected request with the reason', async () => {
        const requestId = await submit(boris, 'Дубликат идеи');

        await take(requestId, dev);
        await post(`/portal/requests/${requestId}/reject`, dev, ['developer'], {
            reason: 'Уже есть в поставке',
        });
        await waitForOutboxIdle();

        const rejected = (await stored('request.rejected')).filter(
            (n) => n.target_id === requestId,
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.recipient_id).toBe(boris);
        expect(rejected[0]?.body).toContain('Уже есть в поставке');
    });

    it('notifies each author of a linked request once when the skill status changes', async () => {
        const annaRequest = await submit(anna, 'Идея Анны');
        const borisRequest = await submit(boris, 'Идея Бориса');
        const first = await accept(annaRequest, dev, newSkill('Общий навык'));
        const skill = first.skill as { id: string };
        await accept(borisRequest, dev, existingSkill(skill.id));
        await waitForOutboxIdle();

        await changeStatus(skill.id, dev, 'in_dev');
        await waitForOutboxIdle();
        await replayPortalEvents();

        const changed = await stored('request.status-changed');
        const forSkill = changed.filter((n) => [annaRequest, borisRequest].includes(n.target_id));
        expect(forSkill.map((n) => [n.recipient_id, n.target_id]).sort()).toEqual(
            [
                [anna, annaRequest],
                [boris, borisRequest],
            ].sort(),
        );
        expect(forSkill.every((n) => n.body.includes('В разработке'))).toBe(true);
    });

    it('creates one notification per request for two requests of the same author', async () => {
        const one = await submit(anna, 'Первая заявка Анны');
        const two = await submit(anna, 'Вторая заявка Анны');
        const created = await accept(one, dev, newSkill('Навык Анны'));
        const skill = created.skill as { id: string };
        await accept(two, dev, existingSkill(skill.id));
        await waitForOutboxIdle();

        await changeStatus(skill.id, dev, 'in_dev');
        await waitForOutboxIdle();

        const changed = (await stored('request.status-changed')).filter((n) =>
            [one, two].includes(n.target_id),
        );
        expect(changed.map((n) => n.target_id).sort()).toEqual([one, two].sort());
        expect(changed.every((n) => n.recipient_id === anna)).toBe(true);
    });

    it('creates no notification when the author is the developer', async () => {
        const requestId = await submit(dev, 'Своя заявка');

        const created = await accept(requestId, dev, newSkill('Свой навык'));
        await changeStatus((created.skill as { id: string }).id, dev, 'in_dev');
        await waitForOutboxIdle();

        const own = (
            await Promise.all(
                ['request.accepted', 'request.status-changed'].map((type) => stored(type)),
            )
        )
            .flat()
            .filter((n) => n.target_id === requestId);
        expect(own).toEqual([]);
    });

    it('does not notify authors of requests outside the snapshot', async () => {
        const linked = await submit(anna, 'Привязанная');
        const rejectedRequest = await submit(boris, 'Отклонённая');
        const pending = await submit(boris, 'Непривязанная');
        const created = await accept(linked, dev, newSkill('Навык снимка'));
        await take(rejectedRequest, dev);
        await post(`/portal/requests/${rejectedRequest}/reject`, dev, ['developer'], {
            reason: 'Нет',
        });
        await waitForOutboxIdle();

        await changeStatus((created.skill as { id: string }).id, dev, 'in_dev');
        await waitForOutboxIdle();

        const changed = await stored('request.status-changed');
        expect(changed.filter((n) => n.target_id === linked)).toHaveLength(1);
        expect(changed.filter((n) => [rejectedRequest, pending].includes(n.target_id))).toEqual([]);
    });
    describe('request comments', () => {
        const postComment = (
            requestId: string,
            by: string,
            roles: Role[],
            body: string,
        ): Promise<Record<string, unknown>> =>
            post(`/portal/requests/${requestId}/comments`, by, roles, { body });

        async function addDeveloper(login: string, active = true): Promise<string> {
            const id = await addUser(login);
            await client.query(
                "INSERT INTO auth_user_roles (user_id, role) VALUES ($1, 'developer')",
                [id],
            );
            if (!active) {
                await client.query('UPDATE auth_users SET is_active = false WHERE id = $1', [id]);
            }
            return id;
        }

        async function withDevelopers(
            run: (devs: { active: string; other: string; inactive: string }) => Promise<void>,
        ): Promise<void> {
            const suffix = randomUUID().slice(0, 6);
            const active = await addDeveloper(`dev-a-${suffix}`);
            const other = await addDeveloper(`dev-b-${suffix}`);
            const inactive = await addDeveloper(`dev-x-${suffix}`, false);
            try {
                await run({ active, other, inactive });
            } finally {
                await client.query('DELETE FROM auth_user_roles WHERE user_id = ANY($1::uuid[])', [
                    [active, other, inactive],
                ]);
            }
        }

        const forRequest = async (requestId: string): Promise<StoredNotification[]> =>
            (await stored('request.comment-added')).filter((n) => n.target_id === requestId);

        it('notifies active developers, not the author nor a deactivated developer, when the author comments', async () => {
            await withDevelopers(async ({ active, other, inactive }) => {
                const requestId = await submit(anna, 'Комментарий автора');

                await postComment(requestId, anna, [], 'Уточнение от автора');
                await waitForOutboxIdle();

                const notes = await forRequest(requestId);
                const recipients = notes.map((n) => n.recipient_id);
                expect(recipients).toContain(active);
                expect(recipients).toContain(other);
                expect(recipients).not.toContain(anna);
                expect(recipients).not.toContain(inactive);
                expect(new Set(recipients).size).toBe(recipients.length);
                expect(notes.every((n) => n.actor_id === anna && n.target_type === 'request')).toBe(
                    true,
                );
                expect(notes[0]?.title).toContain('Комментарий автора');
                expect(notes[0]?.body).toContain('Уточнение от автора');
            });
        });

        it('notifies only the author when a developer replies', async () => {
            await withDevelopers(async ({ active, other }) => {
                const requestId = await submit(anna, 'Ответ разработчика');

                await postComment(requestId, active, ['developer'], 'Ответ по существу');
                await waitForOutboxIdle();

                const notes = await forRequest(requestId);
                expect(notes.map((n) => n.recipient_id)).toEqual([anna]);
                expect(notes[0]?.actor_id).toBe(active);
                expect(notes.map((n) => n.recipient_id)).not.toContain(other);
            });
        });

        it('creates no notifications when a comment is edited', async () => {
            const requestId = await submit(anna, 'Правка комментария');
            const created = await postComment(requestId, anna, [], 'Первая версия');
            await waitForOutboxIdle();
            const before = await forRequest(requestId);
            const eventsBefore = await client.query<{ n: string }>(
                "SELECT count(*) AS n FROM outbox_events WHERE event_type = 'portal.request_comment_posted'",
            );

            const response = await fetch(
                `${base}/portal/requests/${requestId}/comments/${String(created.id)}`,
                {
                    method: 'PATCH',
                    headers: { ...bearer(anna), 'content-type': 'application/json' },
                    body: JSON.stringify({ body: 'Вторая версия' }),
                },
            );
            expect(response.status).toBe(200);
            await waitForOutboxIdle();

            expect(await forRequest(requestId)).toEqual(before);
            const eventsAfter = await client.query<{ n: string }>(
                "SELECT count(*) AS n FROM outbox_events WHERE event_type = 'portal.request_comment_posted'",
            );
            expect(eventsAfter.rows[0]?.n).toBe(eventsBefore.rows[0]?.n);
        });
    });
});
