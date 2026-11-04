import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL, например
// postgresql://postgres:test@localhost:55440/postgres. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'db', 'migrations');

const LINK_TABLES = [
    ['organization_source', 'organization_id', 'organization'],
    ['faculty_source', 'faculty_id', 'faculty'],
    ['location_source', 'location_id', 'location'],
    ['program_source', 'program_id', 'program'],
    ['offer_source', 'offer_id', 'offer'],
    ['price_source', 'price_id', 'price'],
    ['entrance_requirement_source', 'entrance_requirement_id', 'entrance_requirement'],
] as const;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)(
    'programs ETL run history and provenance migrations',
    () => {
        const dbName = `etl_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        let dbUrl = '';
        let legacyDir = '';
        let client: Client;

        const query = async (
            sql: string,
            params: unknown[] = [],
        ): Promise<Record<string, unknown>[]> =>
            (await client.query<Record<string, unknown>>(sql, params)).rows;

        beforeAll(async () => {
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`CREATE DATABASE ${dbName}`);
            await admin.end();
            dbUrl = withDatabase(adminUrl ?? '', dbName);

            // Состояние до change: только миграции 001-008 и данные со старым source_row_id.
            legacyDir = await mkdtemp(join(tmpdir(), 'etl-legacy-migrations-'));
            for (const f of (await readdir(MIGRATIONS_DIR)).filter((n) => /^00[1-8]_/.test(n))) {
                await cp(join(MIGRATIONS_DIR, f), join(legacyDir, f));
            }
            await migrate(dbUrl, legacyDir);

            client = new Client({ connectionString: dbUrl });
            await client.connect();
            await client.query(`
          INSERT INTO organization (id, kind, name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'university', 'Org');
          INSERT INTO source_sheet (id, spreadsheet_id, sheet_id, title) VALUES ('00000000-0000-0000-0000-0000000000b1', 'ss', 1, 'S');
          INSERT INTO raw_row (id, source_sheet_id, row_no, data, row_hash) VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 2, '{}', 'h');
          INSERT INTO program (id, organization_id, level, title, source_row_id) VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'bachelor', 'P', '00000000-0000-0000-0000-0000000000c1');
        `);

            await migrate(dbUrl);
        }, 60_000);

        afterAll(async () => {
            await client.end();
            await rm(legacyDir, { recursive: true, force: true });
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
            await admin.end();
        });

        it('creates the sync run history table with previous_run_id, status and timestamps', async () => {
            const cols = await query(
                `SELECT column_name, is_nullable FROM information_schema.columns
             WHERE table_name = 'programs_sync_run'`,
            );
            const names = cols.map((c) => c.column_name);
            expect(names).toEqual(
                expect.arrayContaining([
                    'id',
                    'group_id',
                    'previous_run_id',
                    'trigger',
                    'status',
                    'created_at',
                    'started_at',
                    'finished_at',
                    'failure_code',
                    'failure_message',
                ]),
            );
            const fk = await query(
                `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
             WHERE c.conrelid = 'programs_sync_run'::regclass AND c.contype = 'f'`,
            );
            expect(fk.map((r) => r.def)).toEqual([
                expect.stringContaining(
                    'FOREIGN KEY (previous_run_id) REFERENCES programs_sync_run(id)',
                ),
            ]);
        });

        it('restricts run status and trigger values and supports a retry chain', async () => {
            const first = randomUUID();
            const second = randomUUID();
            await query(
                `INSERT INTO programs_sync_run (id, group_id, trigger, status) VALUES ($1, 'g1', 'scheduled', 'failed')`,
                [first],
            );
            await query(
                `INSERT INTO programs_sync_run (id, group_id, trigger, status, previous_run_id)
             VALUES ($1, 'g1', 'retry', 'queued', $2)`,
                [second, first],
            );
            await expect(
                query(
                    `INSERT INTO programs_sync_run (id, group_id, trigger, status) VALUES ($1, 'g1', 'scheduled', 'bogus')`,
                    [randomUUID()],
                ),
            ).rejects.toThrow();
            await expect(
                query(
                    `INSERT INTO programs_sync_run (id, group_id, trigger, status) VALUES ($1, 'g1', 'manual', 'queued')`,
                    [randomUUID()],
                ),
            ).rejects.toThrow();
            await expect(
                query(
                    `INSERT INTO programs_sync_run (id, group_id, trigger, status, previous_run_id)
                 VALUES ($1, 'g1', 'retry', 'queued', $2)`,
                    [randomUUID(), randomUUID()],
                ),
            ).rejects.toThrow();
        });

        it.each(LINK_TABLES)(
            '%s has real FKs to the catalog record, raw_row and run history',
            async (table, recordColumn, recordTable) => {
                const fks = await query(
                    `SELECT a.attname AS col, cl.relname AS ref_table
                 FROM pg_constraint c
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                 JOIN pg_class cl ON cl.oid = c.confrelid
                 WHERE c.conrelid = $1::regclass AND c.contype = 'f'`,
                    [table],
                );
                const map = Object.fromEntries(fks.map((r) => [r.col as string, r.ref_table]));
                expect(map).toEqual({
                    [recordColumn]: recordTable,
                    raw_row_id: 'raw_row',
                    last_seen_run_id: 'programs_sync_run',
                });
                const cols = await query(
                    `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = $1`,
                    [table],
                );
                const nullable = Object.fromEntries(
                    cols.map((c) => [c.column_name as string, c.is_nullable]),
                );
                expect(nullable.group_id).toBe('NO');
                expect(nullable.last_seen_run_id).toBe('NO');
                expect(nullable.raw_row_id).toBe('NO');
            },
        );

        it('indexes link tables by raw_row and run for lookups from a changed sheet', async () => {
            for (const [table] of LINK_TABLES) {
                const idx = await query(`SELECT indexdef FROM pg_indexes WHERE tablename = $1`, [
                    table,
                ]);
                const defs = idx.map((r) => r.indexdef as string).join('\n');
                expect(defs).toMatch(/\(raw_row_id\)/);
                expect(defs).toMatch(/\(last_seen_run_id\)/);
            }
        });

        it('allows many raw rows per record and many records per raw row', async () => {
            const run = randomUUID();
            await query(
                `INSERT INTO programs_sync_run (id, group_id, trigger, status) VALUES ($1, 'g2', 'scheduled', 'running')`,
                [run],
            );
            await query(
                `INSERT INTO raw_row (id, source_sheet_id, row_no, data, row_hash)
             VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 3, '{}', 'h2')`,
            );
            const program = '00000000-0000-0000-0000-0000000000d1';
            for (const row of [
                '00000000-0000-0000-0000-0000000000c1',
                '00000000-0000-0000-0000-0000000000c2',
            ]) {
                await query(
                    `INSERT INTO program_source (program_id, raw_row_id, group_id, last_seen_run_id)
                 VALUES ($1, $2, 'g2', $3)`,
                    [program, row, run],
                );
            }
            await expect(
                query(
                    `INSERT INTO program_source (program_id, raw_row_id, group_id, last_seen_run_id)
                 VALUES ($1, '00000000-0000-0000-0000-0000000000c1', 'g2', $2)`,
                    [program, run],
                ),
            ).rejects.toThrow();
            await expect(
                query(
                    `INSERT INTO program_source (program_id, raw_row_id, group_id, last_seen_run_id)
                 VALUES ($1, '00000000-0000-0000-0000-0000000000c1', 'g2', $2)`,
                    [randomUUID(), run],
                ),
            ).rejects.toThrow();
            const rows = await query(
                `SELECT raw_row_id FROM program_source WHERE program_id = $1`,
                [program],
            );
            expect(rows).toHaveLength(2);
        });

        it('keeps migrations 004-008, legacy source_row_id, sheet_mapping and existing data', async () => {
            const applied = (await query(`SELECT name FROM schema_migrations ORDER BY name`)).map(
                (r) => r.name as string,
            );
            for (const prefix of ['004_', '005_', '006_', '007_', '008_']) {
                expect(applied.some((n) => n.startsWith(prefix))).toBe(true);
            }
            expect(applied.filter((n) => /^(009|010)_/.test(n))).toHaveLength(2);

            const legacyCols = await query(
                `SELECT table_name FROM information_schema.columns
             WHERE column_name = 'source_row_id' AND table_name IN ('program', 'offer', 'content_chunk')
             ORDER BY table_name`,
            );
            expect(legacyCols.map((r) => r.table_name)).toEqual([
                'content_chunk',
                'offer',
                'program',
            ]);
            const mapping = await query(`SELECT to_regclass('sheet_mapping') AS t`);
            expect(mapping[0]?.t).toBe('sheet_mapping');

            const program = await query(`SELECT source_row_id FROM program WHERE title = 'P'`);
            expect(program[0]?.source_row_id).toBe('00000000-0000-0000-0000-0000000000c1');
        });

        it('is idempotent on a repeated migrator run and does not wrap files in one ETL transaction', async () => {
            const before = await query(`SELECT count(*)::int AS n FROM schema_migrations`);
            await migrate(dbUrl);
            const after = await query(`SELECT count(*)::int AS n FROM schema_migrations`);
            expect(after[0]?.n).toBe(before[0]?.n);

            const files = (await readdir(MIGRATIONS_DIR)).filter((n) => /^(009|010)_/.test(n));
            expect(files).toHaveLength(2);
        });
    },
);
