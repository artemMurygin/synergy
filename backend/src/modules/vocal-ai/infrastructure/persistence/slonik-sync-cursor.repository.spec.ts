import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import { SyncCursorRegressionError } from '../../domain/errors';
import { SyncCursorRepository } from './slonik-sync-cursor.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('SyncCursorRepository', () => {
    const dbName = `sync_cursor_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: SyncCursorRepository;

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
        repository = new SyncCursorRepository(transactions);
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
        await client.query('DELETE FROM vocal_ai_projects');
    });

    it('returns null for a project that was never synced', async () => {
        expect(await repository.get('project-unsynced')).toBeNull();
    });

    it('returns the stored cursor after it is set', async () => {
        const syncedAt = new Date('2026-03-01T12:00:00Z');

        await repository.set('project-1', syncedAt);

        expect(await repository.get('project-1')).toEqual(syncedAt);
    });

    it('overwrites the cursor on a repeated set for the same project', async () => {
        await repository.set('project-1', new Date('2026-03-01T12:00:00Z'));

        await repository.set('project-1', new Date('2026-03-02T08:00:00Z'));

        expect(await repository.get('project-1')).toEqual(new Date('2026-03-02T08:00:00Z'));
    });

    it('keeps the stored cursor when set() is called with an earlier value than already stored', async () => {
        await repository.set('project-1', new Date('2026-03-02T08:00:00Z'));

        await expect(repository.set('project-1', new Date('2026-03-01T00:00:00Z'))).rejects.toThrow(
            SyncCursorRegressionError,
        );

        expect(await repository.get('project-1')).toEqual(new Date('2026-03-02T08:00:00Z'));
    });

    it('accepts set() with a value equal to the already stored cursor', async () => {
        const syncedAt = new Date('2026-03-02T08:00:00Z');
        await repository.set('project-1', syncedAt);

        await expect(repository.set('project-1', syncedAt)).resolves.toBeUndefined();

        expect(await repository.get('project-1')).toEqual(syncedAt);
    });

    it('stores the cursor of each project independently', async () => {
        await repository.set('project-1', new Date('2026-03-01T00:00:00Z'));
        await repository.set('project-2', new Date('2026-04-01T00:00:00Z'));

        expect(await repository.get('project-1')).toEqual(new Date('2026-03-01T00:00:00Z'));
        expect(await repository.get('project-2')).toEqual(new Date('2026-04-01T00:00:00Z'));
        expect(await repository.get('project-3')).toBeNull();
    });
});
