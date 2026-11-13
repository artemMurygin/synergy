import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import {
    InvalidSkillTransitionError,
    RequestAlreadyDecidedError,
    RequestNotFoundError,
} from '../domain/errors';
import { Frequency } from '../domain/frequency';
import { IdeaRequest } from '../domain/idea-request';
import type { CatalogSeedProduct } from '../domain/ports/catalog-repository.port';
import { RequestTitle } from '../domain/request-title';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { SlonikCatalogRepository } from './slonik-catalog.repository';
import { SlonikRequestQuery } from './slonik-request.query';
import { SlonikRequestRepository } from './slonik-request.repository';
import { SlonikSkillQuery } from './slonik-skill.query';
import { SlonikSkillRepository } from './slonik-skill.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error('Expected a value');
    return value;
}

const T0 = new Date('2026-01-01T00:00:00.000Z');
const SECOND = 1000;

describe.skipIf(adminUrl === undefined)('Slonik portal repositories', () => {
    const dbName = `portal_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let requests: SlonikRequestRepository;
    let requestQuery: SlonikRequestQuery;
    let skills: SlonikSkillRepository;
    let skillQuery: SlonikSkillQuery;
    let catalog: SlonikCatalogRepository;
    let alice: string;
    let bob: string;
    let dev: string;
    let agentId: string;
    let productId: string;

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    let seq = 0;
    function makeRequest(authorId = alice, createdAtOffsetSec = ++seq): IdeaRequest {
        return IdeaRequest.create({
            id: randomUUID(),
            authorId,
            title: RequestTitle.of(`Заявка ${String(seq)}`),
            description: 'Описание процесса',
            frequency: Frequency.of(5, 'week'),
            minutesPerRun: 20,
            peopleCount: 3,
            now: new Date(T0.getTime() + createdAtOffsetSec * SECOND),
        });
    }

    function makeSkill(name = `Навык ${String(++seq)}`): Skill {
        return Skill.create({
            id: randomUUID(),
            agentId,
            name: SkillName.of(name),
            description: 'Описание навыка',
            now: new Date(T0.getTime() + seq * SECOND),
        });
    }

    async function count(table: string): Promise<number> {
        const result = await client.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM ${table}`,
        );
        return result.rows[0]?.count ?? 0;
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        pool = await createPool(dbUrl);
        transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        requests = new SlonikRequestRepository(transactions);
        requestQuery = new SlonikRequestQuery(transactions);
        skills = new SlonikSkillRepository(transactions);
        skillQuery = new SlonikSkillQuery(transactions);
        catalog = new SlonikCatalogRepository(transactions);
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM portal_requests');
        await client.query('DELETE FROM portal_skills');
        await client.query('DELETE FROM portal_agents');
        await client.query('DELETE FROM portal_products');
        await client.query('DELETE FROM auth_users');
        alice = await addUser('alice');
        bob = await addUser('bob');
        dev = await addUser('dev');
        await catalog.seed([
            {
                slug: 'control-center',
                name: 'Control Center',
                agents: [{ slug: 'cc-tasks', name: 'Задачи' }],
            },
        ]);
        const [entry] = await catalog.listAgents();
        agentId = entry.agent.id;
        productId = entry.product.id;
    });

    describe('SlonikSkillRepository', () => {
        it('save + findById round-trip', async () => {
            const skill = makeSkill('Сводка встречи');
            await skills.save(skill);

            const found = await skills.findById(skill.id);

            expect(found?.id).toBe(skill.id);
            expect(found?.agentId).toBe(agentId);
            expect(found?.name.value).toBe('Сводка встречи');
            expect(found?.description).toBe('Описание навыка');
            expect(found?.status).toBe('planned');
            expect(found?.statusChangedAt.getTime()).toBe(skill.statusChangedAt.getTime());
            expect(found?.createdAt.getTime()).toBe(skill.createdAt.getTime());
            expect(await skills.findById(randomUUID())).toBeNull();
        });

        it('findForUpdate returns null for an unknown skill', async () => {
            expect(await transactions.run(() => skills.findForUpdate(randomUUID()))).toBeNull();
        });

        it('findForUpdate locks the row: a parallel FOR UPDATE waits for the first transaction', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const order: string[] = [];
            let release: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            let firstLocked: () => void = () => undefined;
            const locked = new Promise<void>((resolve) => {
                firstLocked = resolve;
            });

            const first = transactions.run(async () => {
                await skills.findForUpdate(skill.id);
                firstLocked();
                await gate;
                order.push('first-commit');
            });
            await locked;
            const second = transactions
                .run(async () => {
                    await skills.findForUpdate(skill.id);
                    order.push('second-locked');
                })
                .catch(() => undefined);
            // Даём второй транзакции шанс обогнать первую, если блокировки нет.
            await new Promise((resolve) => setTimeout(resolve, 300));
            release();
            await Promise.all([first, second]);

            expect(order).toEqual(['first-commit', 'second-locked']);
        });

        it('conditional save updates status and statusChangedAt when the expected status matches', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const loaded = await skills.findById(skill.id);
            const now = new Date(T0.getTime() + 60 * SECOND);
            loaded?.advance('in_dev', now);

            await skills.save(must(loaded), 'planned');

            const after = await skills.findById(skill.id);
            expect(after?.status).toBe('in_dev');
            expect(after?.statusChangedAt.getTime()).toBe(now.getTime());
        });

        it('conditional save with a stale expected status conflicts and changes nothing', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            await client.query(`UPDATE portal_skills SET status = 'in_dev' WHERE id = $1`, [
                skill.id,
            ]);
            const stale = await skills.findById(skill.id);
            stale?.advance('testing', new Date(T0.getTime() + 60 * SECOND));

            await expect(skills.save(must(stale), 'planned')).rejects.toBeInstanceOf(
                InvalidSkillTransitionError,
            );

            const after = await skills.findById(skill.id);
            expect(after?.status).toBe('in_dev');
        });
    });

    describe('SlonikRequestRepository', () => {
        it('save + findById round-trip of a pending request', async () => {
            const request = makeRequest();
            await requests.save(request);

            const found = await requests.findById(request.id);

            expect(found?.authorId).toBe(alice);
            expect(found?.title.value).toBe(request.title.value);
            expect(found?.description).toBe('Описание процесса');
            expect(found?.frequency.count).toBe(5);
            expect(found?.frequency.period).toBe('week');
            expect(found?.minutesPerRun).toBe(20);
            expect(found?.peopleCount).toBe(3);
            expect(found?.decision).toEqual({ kind: 'pending' });
            expect(found?.createdAt.getTime()).toBe(request.createdAt.getTime());
            expect(await requests.findById(randomUUID())).toBeNull();
        });

        it('persists an accepted decision', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const request = makeRequest();
            await requests.save(request);
            const decidedAt = new Date(T0.getTime() + 90 * SECOND);
            request.accept(skill.id, dev, decidedAt);

            await requests.save(request);

            const found = await requests.findById(request.id);
            expect(found?.decision).toEqual({
                kind: 'accepted',
                skillId: skill.id,
                decidedBy: dev,
                decidedAt,
            });
        });

        it('persists a rejected decision with its reason', async () => {
            const request = makeRequest();
            await requests.save(request);
            const decidedAt = new Date(T0.getTime() + 90 * SECOND);
            request.reject('Уже есть в поставке', dev, decidedAt);

            await requests.save(request);

            const found = await requests.findById(request.id);
            expect(found?.decision).toEqual({
                kind: 'rejected',
                reason: 'Уже есть в поставке',
                decidedBy: dev,
                decidedAt,
            });
        });

        it('a second decision for an already decided request fails and keeps the first', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const request = makeRequest();
            await requests.save(request);
            const first = must(await requests.findById(request.id));
            const second = must(await requests.findById(request.id));
            first.accept(skill.id, dev, new Date(T0.getTime() + 10 * SECOND));
            second.reject('Нет', dev, new Date(T0.getTime() + 11 * SECOND));

            await requests.save(first);
            await expect(requests.save(second)).rejects.toBeInstanceOf(RequestAlreadyDecidedError);

            const found = await requests.findById(request.id);
            expect(found?.decision.kind).toBe('accepted');
        });

        it('saving a decision for a missing request fails with RequestNotFoundError', async () => {
            const request = makeRequest();
            request.reject('Нет', dev, new Date(T0.getTime() + 10 * SECOND));

            await expect(requests.save(request)).rejects.toBeInstanceOf(RequestNotFoundError);
        });

        it('listLinkedToSkill returns a snapshot of accepted requests of that skill only', async () => {
            const skill = makeSkill();
            const other = makeSkill();
            await skills.save(skill);
            await skills.save(other);
            const a = makeRequest(alice);
            const b = makeRequest(bob);
            const toOther = makeRequest(alice);
            const pending = makeRequest(bob);
            const rejected = makeRequest(alice);
            for (const request of [a, b, toOther, pending, rejected]) await requests.save(request);
            a.accept(skill.id, dev, T0);
            b.accept(skill.id, dev, T0);
            toOther.accept(other.id, dev, T0);
            rejected.reject('Нет', dev, T0);
            for (const request of [a, b, toOther, rejected]) await requests.save(request);

            const snapshot = await requests.listLinkedToSkill(skill.id);

            expect(snapshot).toEqual([
                { requestId: a.id, authorId: alice, title: a.title.value },
                { requestId: b.id, authorId: bob, title: b.title.value },
            ]);
            expect(await requests.listLinkedToSkill(randomUUID())).toEqual([]);
        });
    });

    describe('SlonikRequestQuery', () => {
        it('listByAuthor returns only own requests, newest first, with total', async () => {
            const old = makeRequest(alice, 1);
            const middle = makeRequest(alice, 2);
            const newest = makeRequest(alice, 3);
            const foreign = makeRequest(bob, 4);
            for (const request of [old, middle, newest, foreign]) await requests.save(request);

            const page = await requestQuery.listByAuthor(alice, { limit: 50, page: 0 });

            expect(page.total).toBe(3);
            expect(page.items.map((item) => item.id)).toEqual([newest.id, middle.id, old.id]);
            expect(page.items[0]).toMatchObject({
                authorId: alice,
                authorLogin: 'alice',
                frequency: { count: 5, period: 'week' },
                minutesPerRun: 20,
                peopleCount: 3,
                status: { code: 'pending', label: 'На рассмотрении' },
                rejectReason: null,
                skill: null,
            });
            expect(page.items[0]?.createdAt.getTime()).toBe(newest.createdAt.getTime());
        });

        it('listByAuthor paginates', async () => {
            const created = [1, 2, 3].map((offset) => makeRequest(alice, offset));
            for (const request of created) await requests.save(request);

            const first = await requestQuery.listByAuthor(alice, { limit: 2, page: 0 });
            const second = await requestQuery.listByAuthor(alice, { limit: 2, page: 1 });

            expect(first.total).toBe(3);
            expect(first.items.map((item) => item.id)).toEqual([created[2]?.id, created[1]?.id]);
            expect(second.total).toBe(3);
            expect(second.items.map((item) => item.id)).toEqual([created[0]?.id]);
        });

        it('derives the status from the linked skill at read time', async () => {
            const skill = makeSkill('Сверка актов');
            await skills.save(skill);
            const request = makeRequest(alice);
            await requests.save(request);
            request.accept(skill.id, dev, T0);
            await requests.save(request);

            const planned = await requestQuery.findView(request.id);
            await client.query(`UPDATE portal_skills SET status = 'in_dev' WHERE id = $1`, [
                skill.id,
            ]);
            const inDev = await requestQuery.findView(request.id);

            expect(planned?.status).toEqual({ code: 'planned', label: 'Запланировано' });
            expect(planned?.skill).toEqual({
                id: skill.id,
                name: 'Сверка актов',
                description: 'Описание навыка',
            });
            expect(inDev?.status).toEqual({ code: 'in_dev', label: 'В разработке' });
        });

        it('shows the reject reason and "Отклонена" for a rejected request', async () => {
            const request = makeRequest(alice);
            await requests.save(request);
            request.reject('Уже есть в поставке', dev, T0);
            await requests.save(request);

            const view = await requestQuery.findView(request.id);

            expect(view?.status).toEqual({ code: 'rejected', label: 'Отклонена' });
            expect(view?.rejectReason).toBe('Уже есть в поставке');
            expect(view?.skill).toBeNull();
        });

        it('findView returns null for an unknown request', async () => {
            expect(await requestQuery.findView(randomUUID())).toBeNull();
        });

        it('listPending returns only pending requests, oldest first, with the author', async () => {
            const newer = makeRequest(bob, 20);
            const older = makeRequest(alice, 10);
            const decided = makeRequest(alice, 5);
            for (const request of [newer, older, decided]) await requests.save(request);
            decided.reject('Нет', dev, T0);
            await requests.save(decided);

            const page = await requestQuery.listPending({ limit: 50, page: 0 });

            expect(page.total).toBe(2);
            expect(page.items.map((item) => item.id)).toEqual([older.id, newer.id]);
            expect(page.items.map((item) => item.authorLogin)).toEqual(['alice', 'bob']);
        });

        it('listPending paginates', async () => {
            const created = [1, 2, 3].map((offset) => makeRequest(alice, offset));
            for (const request of created) await requests.save(request);

            const second = await requestQuery.listPending({ limit: 2, page: 1 });

            expect(second.total).toBe(3);
            expect(second.items.map((item) => item.id)).toEqual([created[2]?.id]);
        });
    });

    describe('SlonikSkillQuery', () => {
        it('lists skills with agent, product and linked request count, filtered by status', async () => {
            const first = makeSkill('Первый');
            const second = makeSkill('Второй');
            await skills.save(first);
            await skills.save(second);
            await client.query(`UPDATE portal_skills SET status = 'in_dev' WHERE id = $1`, [
                second.id,
            ]);
            const request = makeRequest(alice);
            await requests.save(request);
            request.accept(first.id, dev, T0);
            await requests.save(request);

            const all = await skillQuery.list({}, { limit: 50, page: 0 });
            const inDev = await skillQuery.list({ status: 'in_dev' }, { limit: 50, page: 0 });

            expect(all.total).toBe(2);
            const firstView = all.items.find((item) => item.id === first.id);
            expect(firstView).toMatchObject({
                name: 'Первый',
                status: 'planned',
                agent: { id: agentId, name: 'Задачи' },
                product: { id: productId, name: 'Control Center' },
                linkedRequestCount: 1,
            });
            expect(all.items.find((item) => item.id === second.id)?.linkedRequestCount).toBe(0);
            expect(inDev.total).toBe(1);
            expect(inDev.items.map((item) => item.id)).toEqual([second.id]);
        });

        it('findView returns one skill or null', async () => {
            const skill = makeSkill('Сводка');
            await skills.save(skill);

            expect((await skillQuery.findView(skill.id))?.name).toBe('Сводка');
            expect(await skillQuery.findView(randomUUID())).toBeNull();
        });
    });

    describe('SlonikCatalogRepository', () => {
        const SEED: CatalogSeedProduct[] = [
            {
                slug: 'manager-helper',
                name: 'Manager Helper',
                agents: [{ slug: 'audit-agent', name: 'Аудит сделок' }],
            },
            { slug: 'web', name: 'Веб', agents: [] },
        ];

        it('seed creates products and agents and reports how many were created', async () => {
            const result = await catalog.seed(SEED);

            expect(result).toEqual({ productsCreated: 2, agentsCreated: 1 });
            expect(await count('portal_products')).toBe(3);
            expect(await count('portal_agents')).toBe(2);
        });

        it('seed is idempotent and does not overwrite existing records', async () => {
            await catalog.seed(SEED);
            const changed: CatalogSeedProduct[] = [
                {
                    slug: 'manager-helper',
                    name: 'Другое имя',
                    agents: [{ slug: 'audit-agent', name: 'Другое имя агента' }],
                },
                { slug: 'web', name: 'Другое имя веба', agents: [] },
            ];

            const again = await catalog.seed(changed);

            expect(again).toEqual({ productsCreated: 0, agentsCreated: 0 });
            expect(await count('portal_products')).toBe(3);
            expect(await count('portal_agents')).toBe(2);
            const names = await client.query<{ name: string }>(
                `SELECT name FROM portal_products WHERE slug = 'manager-helper'
                 UNION ALL SELECT name FROM portal_agents WHERE slug = 'audit-agent'`,
            );
            expect(names.rows.map((row) => row.name).sort()).toEqual(
                ['Manager Helper', 'Аудит сделок'].sort(),
            );
        });

        it('listAgents returns agents together with their products', async () => {
            await catalog.seed(SEED);

            const agents = await catalog.listAgents();

            expect(agents.map((entry) => entry.agent.slug).sort()).toEqual([
                'audit-agent',
                'cc-tasks',
            ]);
            const audit = agents.find((entry) => entry.agent.slug === 'audit-agent');
            expect(audit?.product.slug).toBe('manager-helper');
            expect(audit?.agent.productId).toBe(audit?.product.id);
        });

        it('findAgent returns the agent or null', async () => {
            expect((await catalog.findAgent(agentId))?.slug).toBe('cc-tasks');
            expect(await catalog.findAgent(randomUUID())).toBeNull();
        });
    });
});
