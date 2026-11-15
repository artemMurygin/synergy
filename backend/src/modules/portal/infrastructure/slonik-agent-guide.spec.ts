import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

import { AgentGuide } from '../domain/agent-guide';
import { SlonikAgentGuideQuery } from './slonik-agent-guide.query';
import { SlonikAgentGuideRepository } from './slonik-agent-guide.repository';

const T0 = new Date('2026-01-01T00:00:00.000Z');

describe.skipIf(adminUrl === undefined)(
    'SlonikAgentGuideRepository / SlonikAgentGuideQuery',
    () => {
        const dbName = `portal_guide_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        let client: Client;
        let pool: DatabasePool;
        let transactions: TransactionRunner;
        let repo: SlonikAgentGuideRepository;
        let query: SlonikAgentGuideQuery;
        let agentId: string;

        async function addUser(login: string): Promise<string> {
            const id = randomUUID();
            await client.query(
                'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
                [id, login, '$argon2id$fake'],
            );
            return id;
        }

        function write(body: string, by: string, offsetSec = 0): AgentGuide {
            const guide = AgentGuide.write({
                agentId,
                body,
                by,
                now: new Date(T0.getTime() + offsetSec * 1000),
            });
            if (guide === null) throw new Error('empty guide');
            return guide;
        }

        async function guideRows(): Promise<number> {
            const result = await client.query<{ count: number }>(
                'SELECT count(*)::int AS count FROM portal_agent_guides',
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

            repo = new SlonikAgentGuideRepository(transactions);
            query = new SlonikAgentGuideQuery(transactions);
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
            await client.query('DELETE FROM portal_agent_guides');
            await client.query('DELETE FROM portal_agents');
            await client.query('DELETE FROM auth_user_profiles');
            await client.query('DELETE FROM auth_users');
            agentId = randomUUID();
            await client.query('INSERT INTO portal_agents (id, slug, name) VALUES ($1, $2, $3)', [
                agentId,
                'guide-agent',
                'Агент',
            ]);
        });

        it('find: без инструкции — null', async () => {
            expect(await query.find(agentId)).toBeNull();
            expect(await query.find('not-a-uuid')).toBeNull();
        });

        it('upsert: вставка, затем перезапись — последняя запись побеждает, строка одна', async () => {
            const first = await addUser('first');
            const second = await addUser('second');
            await repo.upsert(write('Первая', first, 1));
            await repo.upsert(write('Вторая', second, 2));
            expect(await guideRows()).toBe(1);
            const found = await query.find(agentId);
            expect(found?.body).toBe('Вторая');
            expect(found?.updatedBy.id).toBe(second);
            expect(found?.updatedAt.getTime()).toBe(T0.getTime() + 2000);
        });

        it('find: автор с ФИО — ФИО, без профиля — логин', async () => {
            const withName = await addUser('ivanov');
            await client.query(
                'INSERT INTO auth_user_profiles (user_id, last_name, first_name, middle_name) VALUES ($1, $2, $3, $4)',
                [withName, 'Иванов', 'Иван', 'Иванович'],
            );
            await repo.upsert(write('Текст', withName));
            const named = await query.find(agentId);
            expect(named?.updatedBy.fullName).toBe('Иванов Иван Иванович');
            expect(named?.updatedBy.login).toBe('ivanov');

            const plain = await addUser('plain');
            await repo.upsert(write('Текст', plain, 1));
            expect((await query.find(agentId))?.updatedBy.fullName).toBe('plain');
        });

        it('delete: удаляет строку; повторный delete и агент без строки — не ошибка', async () => {
            const author = await addUser('author');
            await repo.upsert(write('Текст', author));
            await repo.delete(agentId);
            expect(await query.find(agentId)).toBeNull();
            await expect(repo.delete(agentId)).resolves.toBeUndefined();
            await expect(repo.delete(randomUUID())).resolves.toBeUndefined();
        });
    },
);
