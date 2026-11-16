import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { BugComment } from '../domain/bug-comment';
import { BugDescription } from '../domain/bug-description';
import { BugReport } from '../domain/bug-report';
import { BugTitle } from '../domain/bug-title';
import { CommentBody } from '../domain/comment-body';
import { SlonikBugCommentQuery } from './slonik-bug-comment.query';
import { SlonikBugCommentRepository } from './slonik-bug-comment.repository';
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

describe.skipIf(adminUrl === undefined)('Slonik bug comments', () => {
    const dbName = `portal_bug_cmt_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let bugs: SlonikBugRepository;
    let comments: SlonikBugCommentRepository;
    let query: SlonikBugCommentQuery;
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

    async function addBug(authorId = alice): Promise<string> {
        const bug = BugReport.report({
            id: randomUUID(),
            authorId,
            productId,
            agentId,
            title: BugTitle.of('Баг'),
            description: BugDescription.of('Описание'),
            now: T0,
        });
        await bugs.insert(bug);
        return bug.id;
    }

    async function addComment(
        bugId: string,
        authorId: string,
        offsetSec: number,
        id: string = randomUUID(),
    ): Promise<string> {
        await comments.insert(
            BugComment.create({
                id,
                bugId,
                authorId,
                body: CommentBody.of(`Комментарий ${String(offsetSec)}`),
                now: new Date(T0.getTime() + offsetSec * SECOND),
            }),
        );
        return id;
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
        comments = new SlonikBugCommentRepository(transactions);
        query = new SlonikBugCommentQuery(transactions);
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
        await client.query('DELETE FROM portal_requests');
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
        await client.query('INSERT INTO portal_products (id, slug, name) VALUES ($1, $2, $2)', [
            productId,
            'product',
        ]);
        await client.query('INSERT INTO portal_agents (id, slug, name) VALUES ($1, $2, $2)', [
            agentId,
            'agent',
        ]);
    });

    describe('SlonikBugCommentRepository', () => {
        it('insert + findById: round-trip, editedAt = null', async () => {
            const bugId = await addBug();
            const id = await addComment(bugId, bob, 1);

            const found = must(await comments.findById(id));

            expect(found.bugId).toBe(bugId);
            expect(found.authorId).toBe(bob);
            expect(found.body.value).toBe('Комментарий 1');
            expect(found.createdAt.getTime()).toBe(T0.getTime() + SECOND);
            expect(found.editedAt).toBeNull();
        });

        it('findById: некорректный UUID и неизвестный id дают null', async () => {
            expect(await comments.findById('not-a-uuid')).toBeNull();
            expect(await comments.findById(randomUUID())).toBeNull();
        });

        it('update пишет body и edited_at, created_at не меняется', async () => {
            const bugId = await addBug();
            const id = await addComment(bugId, bob, 1);
            const loaded = must(await comments.findById(id));
            const editedAt = new Date(T0.getTime() + 60 * SECOND);

            loaded.edit(bob, CommentBody.of('Новый текст'), editedAt);
            await comments.update(loaded);

            const after = must(await comments.findById(id));
            expect(after.body.value).toBe('Новый текст');
            expect(after.editedAt?.getTime()).toBe(editedAt.getTime());
            expect(after.createdAt.getTime()).toBe(T0.getTime() + SECOND);
        });
    });

    describe('SlonikBugCommentQuery', () => {
        it('listByBug: порядок created_at, id; authorRole по author_id бага', async () => {
            const bugId = await addBug(alice);
            const second = await addComment(bugId, dev, 2);
            const first = await addComment(bugId, alice, 1);

            const list = await query.listByBug(bugId);

            expect(list.map((c) => c.id)).toEqual([first, second]);
            expect(list.map((c) => c.authorRole)).toEqual(['bug_author', 'developer']);
            expect(list[1]?.author).toEqual({ id: dev, login: 'dev', fullName: 'dev' });
            expect(list[0]?.editedAt).toBeNull();
        });

        it('listByBug: при равном created_at порядок стабилен по id', async () => {
            const bugId = await addBug();
            const ids = [
                '00000000-0000-4000-8000-000000000002',
                '00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000003',
            ];
            for (const id of ids) await addComment(bugId, bob, 5, id);

            const list = await query.listByBug(bugId);

            expect(list.map((c) => c.id)).toEqual([...ids].sort());
        });

        it('listByBug: ФИО по правилам employee-directory, без ФИО — логин', async () => {
            const bugId = await addBug();
            await client.query(
                'INSERT INTO auth_user_profiles (user_id, last_name, first_name, middle_name) VALUES ($1, $2, $3, $4)',
                [bob, 'Иванов', 'Пётр', 'Сергеевич'],
            );
            await addComment(bugId, bob, 1);
            await addComment(bugId, dev, 2);

            const list = await query.listByBug(bugId);

            expect(list[0]?.author.fullName).toBe('Иванов Пётр Сергеевич');
            expect(list[1]?.author.fullName).toBe('dev');
        });

        it('listByBug: чужие баги не попадают, пустая лента и невалидный id дают []', async () => {
            const mine = await addBug();
            const other = await addBug();
            await addComment(other, bob, 1);

            expect(await query.listByBug(mine)).toEqual([]);
            expect(await query.listByBug(other)).toHaveLength(1);
            expect(await query.listByBug('not-a-uuid')).toEqual([]);
        });

        it('комментарии заявок не попадают в ленту бага', async () => {
            const bugId = await addBug();
            const requestId = randomUUID();
            await client.query(
                `INSERT INTO portal_requests
                    (id, author_id, title, description, frequency_count, frequency_period,
                     minutes_per_run, people_count, decision, created_at)
                 VALUES ($1, $2, 'Заявка', 'Описание', 1, 'week', 10, 1, 'new', now())`,
                [requestId, alice],
            );
            await client.query(
                `INSERT INTO portal_request_comments (id, request_id, author_id, body, created_at)
                 VALUES ($1, $2, $3, 'Про заявку', now())`,
                [randomUUID(), requestId, bob],
            );

            expect(await query.listByBug(bugId)).toEqual([]);
            expect(await query.listByBug(requestId)).toEqual([]);
        });

        it('findView: одна запись в формате ленты или null', async () => {
            const bugId = await addBug(alice);
            const id = await addComment(bugId, alice, 1);

            const view = must(await query.findView(id));

            expect(view.id).toBe(id);
            expect(view.authorId).toBe(alice);
            expect(view.authorRole).toBe('bug_author');
            expect(view.author.login).toBe('alice');
            expect(await query.findView(randomUUID())).toBeNull();
            expect(await query.findView('not-a-uuid')).toBeNull();
        });
    });
});
