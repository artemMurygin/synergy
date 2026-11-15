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
    RequestAlreadyTakenError,
    RequestNotFoundError,
} from '../domain/errors';
import { Agent } from '../domain/agent';
import { AgentNameTakenError, ProductNameTakenError, SlugTakenError } from '../domain/errors';
import { Frequency } from '../domain/frequency';
import { IdeaRequest } from '../domain/idea-request';
import type { CatalogSeedProduct } from '../domain/ports/catalog-repository.port';
import { RequestTitle } from '../domain/request-title';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { SlonikCatalogQuery } from './slonik-catalog.query';
import { SlonikCatalogRepository } from './slonik-catalog.repository';
import { SlonikRequestQuery } from './slonik-request.query';
import { SlonikRequestRepository } from './slonik-request.repository';
import { SlonikSkillQuery } from './slonik-skill.query';
import { SlonikSkillRepository } from './slonik-skill.repository';
import { EffortHours } from '../domain/effort-hours';

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
    let catalogQuery: SlonikCatalogQuery;
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

    async function addProfile(
        userId: string,
        parts: { last?: string | null; first?: string | null; middle?: string | null },
    ): Promise<void> {
        await client.query(
            'INSERT INTO auth_user_profiles (user_id, last_name, first_name, middle_name) VALUES ($1, $2, $3, $4)',
            [userId, parts.last ?? null, parts.first ?? null, parts.middle ?? null],
        );
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

    async function insertProduct(slug: string): Promise<string> {
        const id = randomUUID();
        await client.query('INSERT INTO portal_products (id, slug, name) VALUES ($1, $2, $3)', [
            id,
            slug,
            slug,
        ]);
        return id;
    }

    async function insertAgent(slug: string, productIds: string[]): Promise<string> {
        const id = randomUUID();
        await client.query('INSERT INTO portal_agents (id, slug, name) VALUES ($1, $2, $3)', [
            id,
            slug,
            slug,
        ]);
        for (const product of productIds) {
            await client.query(
                'INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)',
                [id, product],
            );
        }
        return id;
    }

    async function insertSkill(forAgent: string, name: string): Promise<string> {
        const skill = Skill.create({
            id: randomUUID(),
            agentId: forAgent,
            name: SkillName.of(name),
            description: 'Описание навыка',
            now: new Date(T0.getTime() + ++seq * SECOND),
        });
        await skills.save(skill);
        return skill.id;
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
        catalogQuery = new SlonikCatalogQuery(transactions);
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
        await client.query('DELETE FROM portal_agent_products');
        await client.query('DELETE FROM portal_agents');
        await client.query('DELETE FROM portal_products');
        await client.query('DELETE FROM auth_user_profiles');
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
        productId = must(entry.products[0]).id;
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
            loaded?.changeStatus('in_dev', now);

            await skills.save(must(loaded), 'planned');

            const after = await skills.findById(skill.id);
            expect(after?.status).toBe('in_dev');
            expect(after?.statusChangedAt.getTime()).toBe(now.getTime());
        });

        it('launched_at и archived_at сохраняются и читаются', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const loaded = must(await skills.findById(skill.id));
            expect(loaded.launchedAt).toBeNull();
            expect(loaded.archivedAt).toBeNull();
            const t1 = new Date(T0.getTime() + 10 * SECOND);
            const t2 = new Date(T0.getTime() + 20 * SECOND);
            const t3 = new Date(T0.getTime() + 30 * SECOND);
            loaded.changeStatus('in_dev', t1);
            await skills.save(loaded, 'planned');
            loaded.changeStatus('testing', t1);
            await skills.save(loaded, 'in_dev');
            loaded.changeStatus('launched', t2);
            await skills.save(loaded, 'testing');
            loaded.archive(t3);
            await skills.save(loaded, 'launched');

            const after = must(await skills.findById(skill.id));

            expect(after.status).toBe('launched');
            expect(after.launchedAt?.getTime()).toBe(t2.getTime());
            expect(after.archivedAt?.getTime()).toBe(t3.getTime());
        });

        it('архивация (save без смены статуса) не трогает status и statusChangedAt', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const loaded = must(await skills.findById(skill.id));
            loaded.archive(new Date(T0.getTime() + 60 * SECOND));

            await skills.save(loaded, 'planned');

            const after = must(await skills.findById(skill.id));
            expect(after.status).toBe('planned');
            expect(after.statusChangedAt.getTime()).toBe(skill.statusChangedAt.getTime());
            expect(after.archivedAt).not.toBeNull();
            loaded.restore();
            await skills.save(loaded, 'planned');
            expect((await skills.findById(skill.id))?.archivedAt).toBeNull();
        });

        it('launchedAt не меняется при rework и повторном launched', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const loaded = must(await skills.findById(skill.id));
            const firstLaunch = new Date(T0.getTime() + 40 * SECOND);
            for (const [from, to, at] of [
                ['planned', 'in_dev', 10],
                ['in_dev', 'testing', 20],
                ['testing', 'launched', 40],
                ['launched', 'rework', 50],
                ['rework', 'testing', 60],
                ['testing', 'launched', 70],
            ] as const) {
                loaded.changeStatus(to, new Date(T0.getTime() + at * SECOND));
                await skills.save(loaded, from);
            }

            const after = must(await skills.findById(skill.id));

            expect(after.launchedAt?.getTime()).toBe(firstLaunch.getTime());
        });

        it('conditional save with a stale expected status conflicts and changes nothing', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            await client.query(`UPDATE portal_skills SET status = 'in_dev' WHERE id = $1`, [
                skill.id,
            ]);
            const stale = await skills.findById(skill.id);
            stale?.changeStatus('testing', new Date(T0.getTime() + 60 * SECOND));

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
            expect(found?.decision).toEqual({ kind: 'new' });
            expect(found?.createdAt.getTime()).toBe(request.createdAt.getTime());
            expect(await requests.findById(randomUUID())).toBeNull();
        });

        it('persists an accepted decision', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const request = makeRequest();
            await requests.save(request);
            const decidedAt = new Date(T0.getTime() + 90 * SECOND);
            request.take(dev, decidedAt);
            request.accept(skill.id, EffortHours.of(8), dev, decidedAt);

            await requests.save(request, 'new');

            const found = await requests.findById(request.id);
            expect(found?.decision).toEqual({
                kind: 'accepted',
                reviewerId: dev,
                takenAt: decidedAt,
                skillId: skill.id,
                effortHours: 8,
                decidedBy: dev,
                decidedAt,
            });
        });

        it('persists a rejected decision with its reason', async () => {
            const request = makeRequest();
            await requests.save(request);
            const decidedAt = new Date(T0.getTime() + 90 * SECOND);
            request.take(dev, decidedAt);
            request.reject('Уже есть в поставке', dev, decidedAt);

            await requests.save(request, 'new');

            const found = await requests.findById(request.id);
            expect(found?.decision).toEqual({
                kind: 'rejected',
                reviewerId: dev,
                takenAt: decidedAt,
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
            first.take(dev, new Date(T0.getTime() + 10 * SECOND));
            second.take(dev, new Date(T0.getTime() + 10 * SECOND));
            first.accept(skill.id, EffortHours.of(8), dev, new Date(T0.getTime() + 10 * SECOND));
            second.reject('Нет', dev, new Date(T0.getTime() + 11 * SECOND));

            await requests.save(first, 'new');
            await expect(requests.save(second, 'new')).rejects.toBeInstanceOf(
                RequestAlreadyDecidedError,
            );

            const found = await requests.findById(request.id);
            expect(found?.decision.kind).toBe('accepted');
        });

        it('persists under_review with reviewer and takenAt', async () => {
            const request = makeRequest();
            await requests.save(request);
            const takenAt = new Date(T0.getTime() + 40 * SECOND);
            request.take(dev, takenAt);

            await requests.save(request, 'new');

            const found = await requests.findById(request.id);
            expect(found?.decision).toEqual({ kind: 'under_review', reviewerId: dev, takenAt });
        });

        it('accepts from under_review and restores an accepted request without effort', async () => {
            const skill = makeSkill();
            await skills.save(skill);
            const request = makeRequest();
            await requests.save(request);
            request.take(dev, T0);
            await requests.save(request, 'new');
            request.accept(skill.id, EffortHours.of(4), dev, T0);
            await requests.save(request, 'under_review');
            expect((await requests.findById(request.id))?.decision).toMatchObject({
                kind: 'accepted',
                effortHours: 4,
            });

            const legacy = makeRequest();
            await requests.save(legacy);
            await client.query(
                `UPDATE portal_requests SET decision = 'accepted', reviewer_id = $2, taken_at = now(),
                        decided_by = $2, decided_at = now(), skill_id = $3 WHERE id = $1`,
                [legacy.id, dev, skill.id],
            );
            expect((await requests.findById(legacy.id))?.decision).toMatchObject({
                kind: 'accepted',
                effortHours: null,
            });
        });

        it('of two parallel takes exactly one succeeds, the other gets RequestAlreadyTakenError', async () => {
            const request = makeRequest();
            await requests.save(request);
            const first = must(await requests.findById(request.id));
            const second = must(await requests.findById(request.id));
            first.take(dev, new Date(T0.getTime() + 10 * SECOND));
            second.take(bob, new Date(T0.getTime() + 11 * SECOND));

            const results = await Promise.allSettled([
                requests.save(first, 'new'),
                requests.save(second, 'new'),
            ]);

            expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
            const rejected = results.find((r) => r.status === 'rejected');
            expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
                RequestAlreadyTakenError,
            );
        });

        it('saving a decision for a missing request fails with RequestNotFoundError', async () => {
            const request = makeRequest();
            request.take(dev, new Date(T0.getTime() + 10 * SECOND));
            request.reject('Нет', dev, new Date(T0.getTime() + 10 * SECOND));

            await expect(requests.save(request, 'new')).rejects.toBeInstanceOf(
                RequestNotFoundError,
            );
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
            a.take(dev, T0);
            a.accept(skill.id, EffortHours.of(8), dev, T0);
            b.take(dev, T0);
            b.accept(skill.id, EffortHours.of(8), dev, T0);
            toOther.take(dev, T0);
            toOther.accept(other.id, EffortHours.of(8), dev, T0);
            rejected.take(dev, T0);
            rejected.reject('Нет', dev, T0);
            for (const request of [a, b, toOther, rejected]) await requests.save(request, 'new');

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
                status: { code: 'new', label: 'Новая' },
                reviewer: null,
                takenAt: null,
                effortHours: null,
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
            request.take(dev, T0);
            request.accept(skill.id, EffortHours.of(8), dev, T0);
            await requests.save(request, 'new');

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
            request.take(dev, T0);
            request.reject('Уже есть в поставке', dev, T0);
            await requests.save(request, 'new');

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
            decided.take(dev, T0);
            decided.reject('Нет', dev, T0);
            await requests.save(decided, 'new');

            const page = await requestQuery.listPending({ limit: 50, page: 0 });

            expect(page.total).toBe(2);
            expect(page.items.map((item) => item.id)).toEqual([older.id, newer.id]);
            expect(page.items.map((item) => item.authorLogin)).toEqual(['alice', 'bob']);
        });

        it('listPending returns new and under_review, oldest first, without decided ones', async () => {
            const taken = makeRequest(alice, 1);
            const fresh = makeRequest(bob, 2);
            const rejected = makeRequest(alice, 3);
            for (const request of [taken, fresh, rejected]) await requests.save(request);
            taken.take(dev, T0);
            await requests.save(taken, 'new');
            rejected.take(dev, T0);
            rejected.reject('Нет', dev, T0);
            await requests.save(rejected, 'new');

            const page = await requestQuery.listPending({ limit: 50, page: 0 });

            expect(page.total).toBe(2);
            expect(page.items.map((item) => item.status.code)).toEqual(['under_review', 'new']);
            expect(page.items.map((item) => item.id)).toEqual([taken.id, fresh.id]);
        });

        it('exposes reviewer with full name (login fallback), takenAt and effortHours', async () => {
            await addProfile(dev, { last: 'Петров', first: 'Пётр' });
            const skill = makeSkill();
            await skills.save(skill);
            const underReview = makeRequest(alice, 1);
            const accepted = makeRequest(alice, 2);
            for (const request of [underReview, accepted]) await requests.save(request);
            const takenAt = new Date(T0.getTime() + 30 * SECOND);
            underReview.take(dev, takenAt);
            await requests.save(underReview, 'new');
            accepted.take(dev, takenAt);
            accepted.accept(skill.id, EffortHours.of(16), dev, takenAt);
            await requests.save(accepted, 'new');

            const own = await requestQuery.listByAuthor(alice, { limit: 50, page: 0 });
            const view = await requestQuery.findView(underReview.id);

            expect(view).toMatchObject({
                reviewer: { id: dev, login: expect.any(String) as string, fullName: 'Петров Пётр' },
                effortHours: null,
            });
            expect(view?.takenAt?.getTime()).toBe(takenAt.getTime());
            expect(own.items.find((item) => item.id === accepted.id)?.effortHours).toBe(16);
        });

        it('builds the author full name from the profile and falls back to the login', async () => {
            await addProfile(alice, { last: 'Иванова', first: 'Анна', middle: 'Петровна' });
            const withProfile = makeRequest(alice, 1);
            const withoutProfile = makeRequest(bob, 2);
            for (const request of [withProfile, withoutProfile]) await requests.save(request);

            const page = await requestQuery.listPending({ limit: 50, page: 0 });
            const card = await requestQuery.findView(withProfile.id);

            expect(page.items.map((item) => item.authorFullName)).toEqual([
                'Иванова Анна Петровна',
                'bob',
            ]);
            expect(card?.authorFullName).toBe('Иванова Анна Петровна');
            expect(card?.authorLogin).toBe('alice');
        });

        it('uses the login when the profile has no name parts', async () => {
            await addProfile(alice, {});
            const request = makeRequest(alice);
            await requests.save(request);

            expect((await requestQuery.findView(request.id))?.authorFullName).toBe('alice');
        });

        it('keeps the request of a dismissed author in the queue with the same full name', async () => {
            await addProfile(alice, { last: 'Иванова', first: 'Анна' });
            const request = makeRequest(alice);
            await requests.save(request);
            await client.query('UPDATE auth_users SET is_active = false WHERE id = $1', [alice]);

            const page = await requestQuery.listPending({ limit: 50, page: 0 });

            expect(page.total).toBe(1);
            expect(page.items[0]?.authorFullName).toBe('Иванова Анна');
        });

        it('listByAuthor still works for an author with a profile', async () => {
            await addProfile(alice, { last: 'Иванова', first: 'Анна' });
            await requests.save(makeRequest(alice));

            const page = await requestQuery.listByAuthor(alice, { limit: 50, page: 0 });

            expect(page.total).toBe(1);
            expect(page.items[0]?.authorFullName).toBe('Иванова Анна');
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
            request.take(dev, T0);
            request.accept(first.id, EffortHours.of(8), dev, T0);
            await requests.save(request, 'new');

            const all = await skillQuery.list({}, { limit: 50, page: 0 });
            const inDev = await skillQuery.list({ status: 'in_dev' }, { limit: 50, page: 0 });

            expect(all.total).toBe(2);
            const firstView = all.items.find((item) => item.id === first.id);
            expect(firstView).toMatchObject({
                name: 'Первый',
                status: 'planned',
                agent: { id: agentId, name: 'Задачи' },
                products: [{ id: productId, slug: 'control-center', name: 'Control Center' }],
                launchedAt: null,
                archivedAt: null,
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

    describe('SlonikSkillQuery: архив и rework', () => {
        it('list скрывает архивные навыки и навыки архивных агентов, total считает только видимые', async () => {
            const visible = makeSkill('Видимый');
            const archived = makeSkill('Архивный');
            const ofArchivedAgent = makeSkill('Навык архивного агента');
            await skills.save(visible);
            await skills.save(archived);
            await skills.save(ofArchivedAgent);
            await client.query(`UPDATE portal_skills SET archived_at = now() WHERE id = $1`, [
                archived.id,
            ]);
            await client.query(`UPDATE portal_agents SET archived_at = now() WHERE id = $1`, [
                agentId,
            ]);
            const other = await insertAgent('other', [productId]);
            const otherSkill = await insertSkill(other, 'Чужой видимый');

            const result = await skillQuery.list({}, { limit: 50, page: 0 });

            expect(result.total).toBe(1);
            expect(result.items.map((item) => item.id)).toEqual([otherSkill]);
        });

        it('findView возвращает архивный навык с archivedAt и навык архивного агента', async () => {
            const archived = makeSkill('Архивный');
            const inArchivedAgent = makeSkill('В архивном агенте');
            await skills.save(archived);
            await skills.save(inArchivedAgent);
            await client.query(`UPDATE portal_skills SET archived_at = now() WHERE id = $1`, [
                archived.id,
            ]);
            await client.query(`UPDATE portal_agents SET archived_at = now() WHERE id = $1`, [
                agentId,
            ]);

            const view = await skillQuery.findView(archived.id);

            expect(view?.archivedAt).toBeInstanceOf(Date);
            expect((await skillQuery.findView(inArchivedAgent.id))?.name).toBe('В архивном агенте');
        });

        it('фильтр rework работает; launchedAt приходит из колонки', async () => {
            const rework = makeSkill('Доработка');
            const launched = makeSkill('Запущенный');
            await skills.save(rework);
            await skills.save(launched);
            await client.query(`UPDATE portal_skills SET status = 'rework' WHERE id = $1`, [
                rework.id,
            ]);
            await client.query(
                `UPDATE portal_skills SET status = 'launched', launched_at = $2 WHERE id = $1`,
                [launched.id, T0],
            );

            const result = await skillQuery.list({ status: 'rework' }, { limit: 50, page: 0 });
            const launchedView = await skillQuery.findView(launched.id);

            expect(result.items.map((item) => item.id)).toEqual([rework.id]);
            expect(launchedView?.launchedAt?.getTime()).toBe(T0.getTime());
        });

        it('агент из двух продуктов даёт одну строку с products[] по slug', async () => {
            const second = await insertProduct('alpha');
            await client.query(
                'INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)',
                [agentId, second],
            );
            const skill = makeSkill('Общий');
            await skills.save(skill);

            const result = await skillQuery.list({}, { limit: 50, page: 0 });

            expect(result.total).toBe(1);
            expect(result.items[0]?.products.map((p) => p.slug)).toEqual([
                'alpha',
                'control-center',
            ]);
        });
    });

    describe('SlonikCatalogQuery', () => {
        it('loadVisible: продукты без агентов, агент из двух продуктов в обоих, сортировка', async () => {
            const alpha = await insertProduct('alpha');
            await insertProduct('empty');
            await client.query(
                'INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)',
                [agentId, alpha],
            );
            await insertSkill(agentId, 'Яблоко');
            await insertSkill(agentId, 'Арбуз');
            const zeta = await insertAgent('a-zeta', [productId]);
            await insertAgent('a-beta', [productId]);

            const rows = await catalogQuery.loadVisible();

            expect(rows.map((row) => row.product.slug)).toEqual([
                'alpha',
                'alpha',
                'control-center',
                'control-center',
                'control-center',
                'control-center',
                'empty',
            ]);
            const empty = rows.find((row) => row.product.slug === 'empty');
            expect(empty).toMatchObject({ agent: null, skill: null });
            const inAlpha = rows.filter((row) => row.product.slug === 'alpha');
            expect(inAlpha.map((row) => row.skill?.name)).toEqual(['Арбуз', 'Яблоко']);
            const inCc = rows.filter((row) => row.product.slug === 'control-center');
            expect(inCc.map((row) => row.agent?.slug)).toEqual([
                'a-beta',
                'a-zeta',
                'cc-tasks',
                'cc-tasks',
            ]);
            expect(zeta).toBeDefined();
            expect(inCc.find((row) => row.skill !== null)?.skill).toMatchObject({
                status: 'planned',
                launchedAt: null,
            });
        });

        it('loadVisible скрывает архивных агентов и архивные навыки', async () => {
            const hiddenAgent = await insertAgent('hidden', [productId]);
            await insertSkill(hiddenAgent, 'Навык скрытого агента');
            const keptSkill = await insertSkill(agentId, 'Остаётся');
            const archivedSkill = await insertSkill(agentId, 'В архиве');
            await client.query(`UPDATE portal_agents SET archived_at = now() WHERE id = $1`, [
                hiddenAgent,
            ]);
            await client.query(`UPDATE portal_skills SET archived_at = now() WHERE id = $1`, [
                archivedSkill,
            ]);

            const rows = await catalogQuery.loadVisible();

            expect(rows).toHaveLength(1);
            expect(rows[0]?.agent?.id).toBe(agentId);
            expect(rows[0]?.skill?.id).toBe(keptSkill);
        });

        it('loadVisible отдаёт launchedAt навыка', async () => {
            const id = await insertSkill(agentId, 'Запущенный');
            await client.query(
                `UPDATE portal_skills SET status = 'launched', launched_at = $2 WHERE id = $1`,
                [id, T0],
            );

            const rows = await catalogQuery.loadVisible();

            expect(rows[0]?.skill?.launchedAt?.getTime()).toBe(T0.getTime());
        });

        it('loadArchive: архивный агент с продуктами и числом навыков без своего архива', async () => {
            const second = await insertProduct('alpha');
            await client.query(
                'INSERT INTO portal_agent_products (agent_id, product_id) VALUES ($1, $2)',
                [agentId, second],
            );
            await insertSkill(agentId, 'Обычный');
            const own = await insertSkill(agentId, 'Свой архив');
            await client.query(`UPDATE portal_skills SET archived_at = now() WHERE id = $1`, [own]);
            await client.query(`UPDATE portal_agents SET archived_at = $2 WHERE id = $1`, [
                agentId,
                T0,
            ]);

            const archive = await catalogQuery.loadArchive();

            expect(archive.agents).toHaveLength(1);
            expect(archive.agents[0]).toMatchObject({
                id: agentId,
                name: 'Задачи',
                skillsCount: 1,
            });
            expect(archive.agents[0]?.products.map((p) => p.slug)).toEqual([
                'alpha',
                'control-center',
            ]);
            expect(archive.agents[0]?.archivedAt.getTime()).toBe(T0.getTime());
        });

        it('loadArchive: архивный навык с агентом и статусом; навыки архивного агента без своего архива не входят', async () => {
            const archivedSkill = await insertSkill(agentId, 'В архиве');
            await client.query(
                `UPDATE portal_skills SET archived_at = $2, status = 'testing' WHERE id = $1`,
                [archivedSkill, T0],
            );
            const hidden = await insertAgent('hidden', [productId]);
            await insertSkill(hidden, 'Вернётся с агентом');
            await client.query(`UPDATE portal_agents SET archived_at = now() WHERE id = $1`, [
                hidden,
            ]);

            const archive = await catalogQuery.loadArchive();

            expect(archive.skills).toHaveLength(1);
            expect(archive.skills[0]).toMatchObject({
                id: archivedSkill,
                name: 'В архиве',
                status: 'testing',
                agent: { id: agentId, name: 'Задачи' },
            });
            expect(archive.skills[0]?.products.map((p) => p.slug)).toEqual(['control-center']);
            expect(archive.skills[0]?.archivedAt.getTime()).toBe(T0.getTime());
        });

        it('loadArchive пуст, когда ничего не архивировано', async () => {
            await insertSkill(agentId, 'Обычный');

            expect(await catalogQuery.loadArchive()).toEqual({ agents: [], skills: [] });
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
        const SHARED_SEED: CatalogSeedProduct[] = [
            {
                slug: 'control-center-x',
                name: 'CC',
                agents: [{ slug: 'assistant', name: 'Ассистент' }],
            },
            {
                slug: 'telegram-x',
                name: 'TG',
                agents: [{ slug: 'assistant', name: 'Ассистент' }],
            },
        ];

        it('seed creates products and agents and reports how many were created', async () => {
            const result = await catalog.seed(SEED);

            expect(result).toEqual({ productsCreated: 2, agentsCreated: 1, skipped: [] });
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

            expect(again).toEqual({ productsCreated: 0, agentsCreated: 0, skipped: [] });
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

        it('listAgents отдаёт каждого агента один раз со списком продуктов', async () => {
            await catalog.seed(SEED);

            const agents = await catalog.listAgents();

            expect(agents.map((entry) => entry.agent.slug).sort()).toEqual([
                'audit-agent',
                'cc-tasks',
            ]);
            const audit = agents.find((entry) => entry.agent.slug === 'audit-agent');
            expect(audit?.products.map((p) => p.slug)).toEqual(['manager-helper']);
            expect(audit?.agent.productIds).toEqual(audit?.products.map((p) => p.id));
        });

        it('seed: агент с одним slug у двух продуктов — одна запись и две связи', async () => {
            const result = await catalog.seed(SHARED_SEED);

            expect(result).toEqual({ productsCreated: 2, agentsCreated: 1, skipped: [] });
            expect(await count('portal_agents')).toBe(2);
            const links = await client.query<{ n: number }>(
                `SELECT count(*)::int AS n FROM portal_agent_products ap
                 JOIN portal_agents a ON a.id = ap.agent_id WHERE a.slug = 'assistant'`,
            );
            expect(links.rows[0]?.n).toBe(2);
            const listed = (await catalog.listAgents()).filter((e) => e.agent.slug === 'assistant');
            expect(listed).toHaveLength(1);
            expect(listed[0]?.products.map((p) => p.slug)).toEqual([
                'control-center-x',
                'telegram-x',
            ]);
        });

        it('seed: повторный запуск добавляет недостающие связи, не удаляя существующие и не меняя имя и archived_at', async () => {
            await catalog.seed([must(SHARED_SEED[0])]);
            await client.query(
                `UPDATE portal_agents SET archived_at = now() WHERE slug = 'assistant'`,
            );
            const before = await client.query<{ archived_at: Date }>(
                `SELECT archived_at FROM portal_agents WHERE slug = 'assistant'`,
            );

            await catalog.seed([
                { ...must(SHARED_SEED[0]), agents: [{ slug: 'assistant', name: 'Другое имя' }] },
                must(SHARED_SEED[1]),
            ]);

            const links = await client.query<{ n: number }>(
                `SELECT count(*)::int AS n FROM portal_agent_products ap
                 JOIN portal_agents a ON a.id = ap.agent_id WHERE a.slug = 'assistant'`,
            );
            expect(links.rows[0]?.n).toBe(2);
            const row = await client.query<{ name: string; archived_at: Date }>(
                `SELECT name, archived_at FROM portal_agents WHERE slug = 'assistant'`,
            );
            expect(row.rows[0]?.name).toBe('Ассистент');
            expect(row.rows[0]?.archived_at).toEqual(before.rows[0]?.archived_at);
        });

        it('findProductByName и findAgentByName ищут по lower(btrim(name)), включая архивных', async () => {
            await catalog.seed(SEED);
            await client.query(
                `UPDATE portal_agents SET archived_at = now() WHERE slug = 'audit-agent'`,
            );

            expect((await catalog.findProductByName('manager helper'))?.slug).toBe(
                'manager-helper',
            );
            expect((await catalog.findAgentByName('аудит сделок'))?.slug).toBe('audit-agent');
            expect(await catalog.findProductByName('нет такого')).toBeNull();
            expect(await catalog.findAgentByName('нет такого')).toBeNull();
        });

        it('nextFreeSlug возвращает base, а при занятом - первый свободный base-N (с архивными)', async () => {
            expect(await catalog.nextFreeSlug('agent', 'free-slug')).toBe('free-slug');
            expect(await catalog.nextFreeSlug('agent', 'cc-tasks')).toBe('cc-tasks-2');
            await client.query(
                `INSERT INTO portal_agents (slug, name, archived_at)
                 VALUES ('cc-tasks-2', 'Архивный', now())`,
            );
            expect(await catalog.nextFreeSlug('agent', 'cc-tasks')).toBe('cc-tasks-3');
            expect(await catalog.nextFreeSlug('product', 'control-center')).toBe(
                'control-center-2',
            );
            expect(await catalog.nextFreeSlug('product', 'cc-tasks')).toBe('cc-tasks');
        });

        it('insertProduct сохраняет продукт; занятые название и slug дают типизированные ошибки', async () => {
            const id = randomUUID();
            await catalog.insertProduct({ id, slug: 'crm', name: 'CRM' });

            expect((await catalog.findProductsByIds([id]))[0]?.slug).toBe('crm');
            await expect(
                catalog.insertProduct({ id: randomUUID(), slug: 'crm-x', name: ' crm ' }),
            ).rejects.toBeInstanceOf(ProductNameTakenError);
            await expect(
                catalog.insertProduct({ id: randomUUID(), slug: 'crm', name: 'Другое' }),
            ).rejects.toBeInstanceOf(SlugTakenError);
        });

        it('insertAgent сохраняет агента со связями; занятые название и slug дают типизированные ошибки', async () => {
            const agent = Agent.create({
                id: randomUUID(),
                slug: 'new-agent',
                name: 'Новый агент',
                productIds: [productId],
                now: T0,
            });
            await catalog.insertAgent(agent);

            const saved = must(await catalog.findAgent(agent.id));
            expect(saved.slug).toBe('new-agent');
            expect(saved.productIds).toEqual([productId]);
            await expect(
                catalog.insertAgent(
                    Agent.create({
                        id: randomUUID(),
                        slug: 'other',
                        name: ' НОВЫЙ агент',
                        productIds: [productId],
                        now: T0,
                    }),
                ),
            ).rejects.toBeInstanceOf(AgentNameTakenError);
            await expect(
                catalog.insertAgent(
                    Agent.create({
                        id: randomUUID(),
                        slug: 'new-agent',
                        name: 'Иное',
                        productIds: [productId],
                        now: T0,
                    }),
                ),
            ).rejects.toBeInstanceOf(SlugTakenError);
            expect(await count('portal_agents')).toBe(2);
        });

        it('seed пропускает продукт и агента с занятым названием, сообщает об этом и не создаёт дублей', async () => {
            const input: CatalogSeedProduct[] = [
                {
                    slug: 'other-cc',
                    name: 'control CENTER',
                    agents: [{ slug: 'x-agent', name: 'Агент икс' }],
                },
                {
                    slug: 'fresh',
                    name: 'Fresh',
                    agents: [{ slug: 'other-tasks', name: 'ЗАДАЧИ' }],
                },
            ];

            const result = await catalog.seed(input);

            expect(result).toEqual({
                productsCreated: 1,
                agentsCreated: 0,
                skipped: [
                    { kind: 'product', slug: 'other-cc', name: 'control CENTER' },
                    { kind: 'agent', slug: 'other-tasks', name: 'ЗАДАЧИ' },
                ],
            });
            expect(await count('portal_products')).toBe(2);
            expect(await count('portal_agents')).toBe(1);
            const again = await catalog.seed(input);
            expect(again.productsCreated).toBe(0);
            expect(again.agentsCreated).toBe(0);
            expect(await count('portal_products')).toBe(2);
            expect(await count('portal_agents')).toBe(1);
        });

        it('listAgents скрывает архивных агентов', async () => {
            await client.query(`UPDATE portal_agents SET archived_at = now() WHERE id = $1`, [
                agentId,
            ]);

            expect(await catalog.listAgents()).toEqual([]);
        });

        it('findAgent, findAgentForShare и findAgentForUpdate возвращают productIds и archivedAt', async () => {
            await catalog.seed(SHARED_SEED);
            const shared = must(
                (await catalog.listAgents()).find((e) => e.agent.slug === 'assistant'),
            );
            await client.query(`UPDATE portal_agents SET archived_at = $2 WHERE id = $1`, [
                shared.agent.id,
                T0,
            ]);

            const found = [
                await catalog.findAgent(shared.agent.id),
                await transactions.run(() => catalog.findAgentForShare(shared.agent.id)),
                await transactions.run(() => catalog.findAgentForUpdate(shared.agent.id)),
            ];

            for (const agent of found) {
                expect([...must(agent).productIds].sort()).toEqual(
                    shared.products.map((p) => p.id).sort(),
                );
                expect(must(agent).archivedAt?.getTime()).toBe(T0.getTime());
            }
            expect(await catalog.findAgent(randomUUID())).toBeNull();
            expect(
                await transactions.run(() => catalog.findAgentForShare(randomUUID())),
            ).toBeNull();
            expect(
                await transactions.run(() => catalog.findAgentForUpdate(randomUUID())),
            ).toBeNull();
        });

        it('findAgentForUpdate блокирует строку: параллельный FOR UPDATE ждёт первую транзакцию', async () => {
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
                await catalog.findAgentForUpdate(agentId);
                firstLocked();
                await gate;
                order.push('first-commit');
            });
            await locked;
            const second = transactions.run(async () => {
                await catalog.findAgentForUpdate(agentId);
                order.push('second-locked');
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            release();
            await Promise.all([first, second]);

            expect(order).toEqual(['first-commit', 'second-locked']);
        });

        it('findAgentForShare не блокирует другой FOR SHARE, но блокирует FOR UPDATE', async () => {
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
                await catalog.findAgentForShare(agentId);
                firstLocked();
                await gate;
                order.push('share-commit');
            });
            await locked;
            await transactions.run(async () => {
                await catalog.findAgentForShare(agentId);
                order.push('second-share');
            });
            const update = transactions.run(async () => {
                await catalog.findAgentForUpdate(agentId);
                order.push('update-locked');
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            release();
            await Promise.all([first, update]);

            expect(order).toEqual(['second-share', 'share-commit', 'update-locked']);
        });

        it('saveAgent обновляет только archived_at', async () => {
            const agent = must(await catalog.findAgent(agentId));
            agent.archive(T0);

            await catalog.saveAgent(agent);

            const row = await client.query<{ name: string; slug: string; archived_at: Date }>(
                `SELECT name, slug, archived_at FROM portal_agents WHERE id = $1`,
                [agentId],
            );
            expect(row.rows[0]?.archived_at.getTime()).toBe(T0.getTime());
            expect(row.rows[0]?.name).toBe('Задачи');
            expect(row.rows[0]?.slug).toBe('cc-tasks');
            const links = await client.query(
                `SELECT 1 FROM portal_agent_products WHERE agent_id = $1`,
                [agentId],
            );
            expect(links.rowCount).toBe(1);
            agent.restore();
            await catalog.saveAgent(agent);
            expect((await catalog.findAgent(agentId))?.archivedAt).toBeNull();
        });

        it('saveAgent не меняет имя, даже если в объекте оно другое', async () => {
            const original = must(await catalog.findAgent(agentId));
            const forged = Agent.restore({
                id: original.id,
                slug: 'other',
                name: 'Другое',
                productIds: original.productIds,
                archivedAt: T0,
                createdAt: original.createdAt,
                updatedAt: original.updatedAt,
            });

            await catalog.saveAgent(forged);

            const after = must(await catalog.findAgent(agentId));
            expect(after.name).toBe('Задачи');
            expect(after.slug).toBe('cc-tasks');
            expect(after.archivedAt?.getTime()).toBe(T0.getTime());
        });
    });
});
