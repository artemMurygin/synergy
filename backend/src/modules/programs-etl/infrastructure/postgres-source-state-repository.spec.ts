import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import { PostgresSourceStateRepository } from './postgres-source-state-repository';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('PostgresSourceStateRepository', () => {
    const dbName = `etl_src_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let repository: PostgresSourceStateRepository;

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
        repository = new PostgresSourceStateRepository(pool);
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
        await client.query('DELETE FROM source_sheet');
        await client.query(`
            INSERT INTO source_sheet (spreadsheet_id, sheet_id, title, content_hash) VALUES
              ('book1', 10, 'A', 'hash-a'),
              ('book1', 11, 'B', NULL),
              ('book2', 10, 'C', 'hash-c')
        `);
    });

    const storedHash = async (spreadsheetId: string, sheetId: number): Promise<unknown> =>
        (
            await client.query<{ content_hash: string | null }>(
                'SELECT content_hash FROM source_sheet WHERE spreadsheet_id = $1 AND sheet_id = $2',
                [spreadsheetId, sheetId],
            )
        ).rows[0]?.content_hash;

    it('returns the successful fingerprint, null for unprocessed and unknown sources', async () => {
        const result = await repository.findSuccessfulFingerprints([
            'book1:10',
            'book1:11',
            'book2:10',
            'book3:99',
        ]);
        expect(result.get('book1:10')).toEqual({ value: 'hash-a' });
        expect(result.get('book1:11')).toBeNull();
        expect(result.get('book2:10')).toEqual({ value: 'hash-c' });
        expect(result.get('book3:99')).toBeNull();
        expect(result.size).toBe(4);
    });

    it('returns an empty map for an empty list', async () => {
        expect((await repository.findSuccessfulFingerprints([])).size).toBe(0);
    });

    it('does not advance the fingerprint until markSuccessfullyProcessed is called', async () => {
        await repository.findSuccessfulFingerprints(['book1:10']);
        expect(await storedHash('book1', 10)).toBe('hash-a');
    });

    it('advances fingerprints of all given sources to the observed hash', async () => {
        await repository.markSuccessfullyProcessed({
            runId: randomUUID(),
            fingerprints: [
                { sourceId: 'book1:10', observedHash: 'new-a' },
                { sourceId: 'book1:11', observedHash: 'new-b' },
            ],
        });
        expect(await storedHash('book1', 10)).toBe('new-a');
        expect(await storedHash('book1', 11)).toBe('new-b');
        expect(await storedHash('book2', 10)).toBe('hash-c');
        const found = await repository.findSuccessfulFingerprints(['book1:10']);
        expect(found.get('book1:10')).toEqual({ value: 'new-a' });
    });

    it('registers a source seen for the first time together with its fingerprint', async () => {
        await repository.markSuccessfullyProcessed({
            runId: randomUUID(),
            fingerprints: [{ sourceId: 'book9:1', observedHash: 'first' }],
        });

        expect(await storedHash('book9', 1)).toBe('first');
        const found = await repository.findSuccessfulFingerprints(['book9:1']);
        expect(found.get('book9:1')).toEqual({ value: 'first' });
    });

    it('rejects a malformed source id', async () => {
        await expect(
            repository.markSuccessfullyProcessed({
                runId: randomUUID(),
                fingerprints: [{ sourceId: 'no-sheet-id', observedHash: 'x' }],
            }),
        ).rejects.toBeInstanceOf(ProgramsSyncError);
    });
});
