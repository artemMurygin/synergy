import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { BugDescription } from '../domain/bug-description';
import { BugReport } from '../domain/bug-report';
import { BugTitle } from '../domain/bug-title';
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

describe.skipIf(adminUrl === undefined)('SlonikBugRepository', () => {
    const dbName = `portal_bug_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let bugs: SlonikBugRepository;
    let alice: string;
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

    function makeBug(offsetSec = 1): BugReport {
        return BugReport.report({
            id: randomUUID(),
            authorId: alice,
            productId,
            agentId,
            title: BugTitle.of('Не открывается'),
            description: BugDescription.of('Шаги:\n1. Открыть'),
            now: new Date(T0.getTime() + offsetSec * SECOND),
        });
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
        bugs = new SlonikBugRepository(
            new TransactionRunner(pool, new PinoLogger({ pinoHttp: { level: 'silent' } })),
        );
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
        await client.query('DELETE FROM auth_users');
        alice = await addUser('alice');
        dev = await addUser('dev');
        productId = randomUUID();
        agentId = randomUUID();
        await client.query('INSERT INTO portal_products (id, slug, name) VALUES ($1, $2, $2)', [
            productId,
            'product',
        ]);
        await client.query('INSERT INTO portal_agents (id, slug, name) VALUES ($1, $2, $2)', [
            agentId,
            'agent',
        ]);
    });

    it('insert + findById: round-trip нового бага', async () => {
        const bug = makeBug();
        await bugs.insert(bug);

        const found = must(await bugs.findById(bug.id));

        expect(found.authorId).toBe(alice);
        expect(found.productId).toBe(productId);
        expect(found.agentId).toBe(agentId);
        expect(found.title.value).toBe('Не открывается');
        expect(found.description.value).toBe('Шаги:\n1. Открыть');
        expect(found.status).toBe('open');
        expect(found.wontFixReason).toBeNull();
        expect(found.statusChangedBy).toBeNull();
        expect(found.createdAt.getTime()).toBe(bug.createdAt.getTime());
        expect(found.statusChangedAt.getTime()).toBe(bug.createdAt.getTime());
    });

    it('findById: некорректный UUID и неизвестный id дают null', async () => {
        expect(await bugs.findById('not-a-uuid')).toBeNull();
        expect(await bugs.findById(randomUUID())).toBeNull();
    });

    it('updateStatus: пишет статус, причину, автора и время; created_at не меняется', async () => {
        const bug = makeBug();
        await bugs.insert(bug);
        const loaded = must(await bugs.findById(bug.id));
        const now = new Date(T0.getTime() + 60 * SECOND);
        const from = loaded.changeStatus('wont_fix', dev, '  Дубль  ', now);

        expect(await bugs.updateStatus(loaded, from)).toBe(true);

        const after = must(await bugs.findById(bug.id));
        expect(after.status).toBe('wont_fix');
        expect(after.wontFixReason?.value).toBe('Дубль');
        expect(after.statusChangedBy).toBe(dev);
        expect(after.statusChangedAt.getTime()).toBe(now.getTime());
        expect(after.createdAt.getTime()).toBe(bug.createdAt.getTime());
    });

    it('updateStatus: уход из wont_fix очищает причину', async () => {
        const bug = makeBug();
        await bugs.insert(bug);
        const loaded = must(await bugs.findById(bug.id));
        const toWontFix = loaded.changeStatus(
            'wont_fix',
            dev,
            'Дубль',
            new Date(T0.getTime() + SECOND),
        );
        await bugs.updateStatus(loaded, toWontFix);
        const again = must(await bugs.findById(bug.id));
        const from = again.changeStatus(
            'in_progress',
            dev,
            null,
            new Date(T0.getTime() + 2 * SECOND),
        );

        expect(await bugs.updateStatus(again, from)).toBe(true);

        const after = must(await bugs.findById(bug.id));
        expect(after.status).toBe('in_progress');
        expect(after.wontFixReason).toBeNull();
    });

    it('updateStatus: проигранная гонка возвращает false и не трогает строку', async () => {
        const bug = makeBug();
        await bugs.insert(bug);
        const first = must(await bugs.findById(bug.id));
        const second = must(await bugs.findById(bug.id));
        const t1 = new Date(T0.getTime() + 10 * SECOND);
        const t2 = new Date(T0.getTime() + 20 * SECOND);
        const fromFirst = first.changeStatus('in_progress', dev, null, t1);
        const fromSecond = second.changeStatus('wont_fix', alice, 'Нет', t2);

        expect(await bugs.updateStatus(first, fromFirst)).toBe(true);
        expect(await bugs.updateStatus(second, fromSecond)).toBe(false);

        const after = must(await bugs.findById(bug.id));
        expect(after.status).toBe('in_progress');
        expect(after.statusChangedBy).toBe(dev);
        expect(after.statusChangedAt.getTime()).toBe(t1.getTime());
        expect(after.wontFixReason).toBeNull();
    });
});
