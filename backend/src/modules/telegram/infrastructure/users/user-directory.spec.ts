import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, sql, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import { FindActiveUserUseCase } from '../../../auth/application/find-active-user.use-case';
import { SlonikUserRepository } from '../../../auth/infrastructure/slonik-user.repository';
import { UserDirectoryPort } from '../../application/ports/user-directory.port';
import { UserDirectory } from './user-directory';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

class RollbackRequested extends Error {}

describe.skipIf(adminUrl === undefined)('UserDirectory', () => {
    const databaseName = `telegram_users_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let directory: UserDirectory;

    async function addUser(login: string, isActive: boolean): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, $4)',
            [id, login, '$argon2id$fake', isActive],
        );
        return id;
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl ?? '', databaseName);
        await migrate(databaseUrl);
        client = new Client({ connectionString: databaseUrl });
        await client.connect();
        pool = await createPool(databaseUrl);
        transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        directory = new UserDirectory(
            new FindActiveUserUseCase(new SlonikUserRepository(pool, transactions)),
        );
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM auth_users');
    });

    it('implements the user directory port', () => {
        expect(directory).toBeInstanceOf(UserDirectoryPort);
    });

    it('returns the id and login of an active user', async () => {
        const ivanov = await addUser('ivanov', true);

        await expect(directory.findActiveById(ivanov)).resolves.toEqual({
            id: ivanov,
            login: 'ivanov',
        });
    });

    it('returns null for a disabled user', async () => {
        const petrov = await addUser('petrov', false);

        await expect(directory.findActiveById(petrov)).resolves.toBeNull();
    });

    it('returns null for a user that does not exist', async () => {
        await addUser('ivanov', true);

        await expect(directory.findActiveById(randomUUID())).resolves.toBeNull();
    });

    it('returns null for an id that is not a uuid without failing the query', async () => {
        await expect(directory.findActiveById('not-a-uuid')).resolves.toBeNull();
        await expect(directory.findActiveById('')).resolves.toBeNull();
    });

    it('reads through the current transaction', async () => {
        const id = randomUUID();

        const seenInside = await transactions
            .run(async () => {
                await transactions.executor().query(sql.unsafe`
                    INSERT INTO auth_users (id, login, password_hash, is_active)
                    VALUES (${id}, ${'sidorov'}, ${'$argon2id$fake'}, true)`);
                const found = await directory.findActiveById(id);
                throw new RollbackRequested(JSON.stringify(found));
            })
            .catch((error: unknown) => (error instanceof RollbackRequested ? error.message : ''));

        expect(JSON.parse(seenInside)).toEqual({ id, login: 'sidorov' });
        await expect(directory.findActiveById(id)).resolves.toBeNull();
    });
});
