import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { BugDescription } from '../domain/bug-description';
import { BugReport } from '../domain/bug-report';
import type { BugStatus } from '../domain/bug-status';
import { BugTitle } from '../domain/bug-title';
import { SlonikBugQuery } from './slonik-bug.query';
import { SlonikBugRepository } from './slonik-bug.repository';

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

describe.skipIf(adminUrl === undefined)('SlonikBugQuery', () => {
    const dbName = `portal_bug_query_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let bugs: SlonikBugRepository;
    let query: SlonikBugQuery;
    let alice: string;
    let bob: string;
    let dev: string;
    let productId: string;
    let agentId: string;

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    /** Создаёт баг и при необходимости переводит в статус (changedAtSec — время смены). */
    async function addBug(
        authorId: string,
        createdSec: number,
        status: BugStatus = 'open',
        changedSec = createdSec,
    ): Promise<string> {
        const bug = BugReport.report({
            id: randomUUID(),
            authorId,
            productId,
            agentId,
            title: BugTitle.of(`Баг ${String(createdSec)}`),
            description: BugDescription.of('Описание'),
            now: new Date(T0.getTime() + createdSec * SECOND),
        });
        await bugs.insert(bug);
        if (status === 'resolved' || status === 'wont_fix') {
            const first = bug.changeStatus(
                'in_progress',
                dev,
                null,
                new Date(T0.getTime() + createdSec * SECOND),
            );
            await bugs.updateStatus(bug, first);
        }
        if (status !== 'open') {
            const from = bug.changeStatus(
                status,
                dev,
                status === 'wont_fix' ? 'Причина' : null,
                new Date(T0.getTime() + changedSec * SECOND),
            );
            await bugs.updateStatus(bug, from);
        }
        return bug.id;
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
        const transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        bugs = new SlonikBugRepository(transactions);
        query = new SlonikBugQuery(transactions);
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
        await client.query('DELETE FROM portal_bugs');
        await client.query('DELETE FROM portal_agent_products');
        await client.query('DELETE FROM portal_agents');
        await client.query('DELETE FROM portal_products');
        await client.query('DELETE FROM auth_user_profiles');
        await client.query('DELETE FROM auth_users');
        alice = await addUser('alice');
        bob = await addUser('bob');
        dev = await addUser('dev');
        productId = randomUUID();
        agentId = randomUUID();
        await client.query('INSERT INTO portal_products (id, slug, name) VALUES ($1, $2, $3)', [
            productId,
            'cc',
            'Control Center',
        ]);
        await client.query('INSERT INTO portal_agents (id, slug, name) VALUES ($1, $2, $3)', [
            agentId,
            'tasks',
            'Задачи',
        ]);
    });

    describe('findView', () => {
        it('собирает продукт, агента, автора и statusChangedBy с ФИО', async () => {
            await client.query(
                'INSERT INTO auth_user_profiles (user_id, last_name, first_name, middle_name) VALUES ($1, $2, $3, $4)',
                [dev, 'Петров', 'Пётр', 'Петрович'],
            );
            const id = await addBug(alice, 1, 'wont_fix', 5);

            const view = must(await query.findView(id));

            expect(view.title).toBe('Баг 1');
            expect(view.description).toBe('Описание');
            expect(view.product).toEqual({ id: productId, name: 'Control Center' });
            expect(view.agent).toEqual({ id: agentId, name: 'Задачи' });
            expect(view.author).toEqual({ id: alice, login: 'alice', fullName: 'alice' });
            expect(view.status).toBe('wont_fix');
            expect(view.wontFixReason).toBe('Причина');
            expect(view.statusChangedBy).toEqual({
                id: dev,
                login: 'dev',
                fullName: 'Петров Пётр Петрович',
            });
            expect(view.createdAt.getTime()).toBe(T0.getTime() + SECOND);
            expect(view.statusChangedAt.getTime()).toBe(T0.getTime() + 5 * SECOND);
        });

        it('новый баг: statusChangedBy и wontFixReason равны null', async () => {
            const id = await addBug(alice, 1);

            const view = must(await query.findView(id));

            expect(view.statusChangedBy).toBeNull();
            expect(view.wontFixReason).toBeNull();
        });

        it('архивный агент не скрывает баг', async () => {
            const id = await addBug(alice, 1);
            await client.query('UPDATE portal_agents SET archived_at = now() WHERE id = $1', [
                agentId,
            ]);

            expect(must(await query.findView(id)).agent.name).toBe('Задачи');
        });

        it('невалидный и неизвестный id дают null', async () => {
            expect(await query.findView('not-a-uuid')).toBeNull();
            expect(await query.findView(randomUUID())).toBeNull();
        });
    });

    describe('listByAuthor', () => {
        it('только свои баги, новые первыми, total считает все', async () => {
            const first = await addBug(alice, 1);
            const second = await addBug(alice, 3);
            await addBug(bob, 2);

            const page = await query.listByAuthor(alice, { page: 0, limit: 10 });

            expect(page.items.map((b) => b.id)).toEqual([second, first]);
            expect(page.total).toBe(2);
            expect(page.items[0]?.product.name).toBe('Control Center');
        });

        it('пагинация: total не зависит от страницы', async () => {
            for (let i = 1; i <= 3; i++) await addBug(alice, i);

            const page = await query.listByAuthor(alice, { page: 1, limit: 2 });

            expect(page.items).toHaveLength(1);
            expect(page.total).toBe(3);
        });

        it('нет багов: пустой список и total 0', async () => {
            expect(await query.listByAuthor(alice, { page: 0, limit: 10 })).toEqual({
                items: [],
                total: 0,
            });
        });
    });

    describe('listQueue', () => {
        it('без фильтра: open и in_progress, сначала open, затем по created_at', async () => {
            const progressOld = await addBug(alice, 1, 'in_progress', 10);
            const openNew = await addBug(alice, 5);
            const openOld = await addBug(bob, 2);
            const progressNew = await addBug(alice, 3, 'in_progress', 11);
            await addBug(alice, 4, 'resolved', 12);
            await addBug(alice, 6, 'wont_fix', 13);

            const page = await query.listQueue(null, { page: 0, limit: 10 });

            expect(page.items.map((b) => b.id)).toEqual([
                openOld,
                openNew,
                progressOld,
                progressNew,
            ]);
            expect(page.total).toBe(4);
        });

        it('open: только open, старые первыми', async () => {
            const late = await addBug(alice, 5);
            const early = await addBug(alice, 2);
            await addBug(alice, 1, 'in_progress', 9);

            const page = await query.listQueue('open', { page: 0, limit: 10 });

            expect(page.items.map((b) => b.id)).toEqual([early, late]);
            expect(page.total).toBe(2);
        });

        it('in_progress: по created_at', async () => {
            const late = await addBug(alice, 5, 'in_progress', 6);
            const early = await addBug(alice, 2, 'in_progress', 20);

            const page = await query.listQueue('in_progress', { page: 0, limit: 10 });

            expect(page.items.map((b) => b.id)).toEqual([early, late]);
        });

        it('resolved и wont_fix: по status_changed_at от новых к старым', async () => {
            const resolvedOld = await addBug(alice, 1, 'resolved', 10);
            const resolvedNew = await addBug(alice, 2, 'resolved', 30);
            const wontFix = await addBug(alice, 3, 'wont_fix', 20);

            const resolved = await query.listQueue('resolved', { page: 0, limit: 10 });
            const wont = await query.listQueue('wont_fix', { page: 0, limit: 10 });

            expect(resolved.items.map((b) => b.id)).toEqual([resolvedNew, resolvedOld]);
            expect(resolved.total).toBe(2);
            expect(wont.items.map((b) => b.id)).toEqual([wontFix]);
        });

        it('автор в элементах очереди', async () => {
            await addBug(alice, 1);

            const page = await query.listQueue(null, { page: 0, limit: 10 });

            expect(page.items[0]?.author.login).toBe('alice');
        });
    });
});
