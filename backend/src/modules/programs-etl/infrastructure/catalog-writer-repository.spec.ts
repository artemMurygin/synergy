import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type { CatalogMutation } from '../application/models/catalog-mutation';
import type { SourceReference } from '../application/models/source-fingerprint';
import { createCatalogMutationPlan } from '../application/models/catalog-mutation';
import { CatalogWriterRepository } from './catalog-writer-repository';

const source = (sourceId: string, ...rowNumbers: number[]): SourceReference => ({
    sourceId,
    rowNumbers,
});

describe('CatalogWriterRepository (no database)', () => {
    it('exposes applyPlan and no delete operation', () => {
        const methods = Object.getOwnPropertyNames(CatalogWriterRepository.prototype);
        expect(methods).toContain('applyPlan');
        expect(methods.filter((name) => /delete|remove|truncate|drop/i.test(name))).toEqual([]);
    });

    it('rejects an unresolved local key before touching the database', async () => {
        const touched: string[] = [];
        const pool = {
            transaction: () => {
                touched.push('transaction');
                return Promise.reject(new Error('must not be reached'));
            },
        } as unknown as DatabasePool;
        const writer = new CatalogWriterRepository(pool);
        const plan = createCatalogMutationPlan([
            {
                kind: 'create',
                recordType: 'faculty',
                data: { organizationId: { ref: 'missing' }, name: 'ФИТ' },
                sources: [source('book1:10', 2)],
            },
        ]);
        const error = await writer
            .applyPlan({ runId: randomUUID(), groupId: 'g1', plan })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ProgramsSyncError);
        expect((error as ProgramsSyncError).code).toBe('INVALID_WORKFLOW_DATA');
    });

    it('maps driver failures to retryable CATALOG_UNAVAILABLE', async () => {
        const pool = {
            transaction: () => Promise.reject(new Error('connection refused')),
        } as unknown as DatabasePool;
        const writer = new CatalogWriterRepository(pool);
        const plan = createCatalogMutationPlan([
            {
                kind: 'create',
                recordType: 'organization',
                data: { kind: 'university', name: 'X' },
                sources: [source('book1:10', 2)],
            },
        ]);
        const error = await writer
            .applyPlan({ runId: randomUUID(), groupId: 'g1', plan })
            .catch((e: unknown) => e);
        expect((error as ProgramsSyncError).code).toBe('CATALOG_UNAVAILABLE');
        expect((error as ProgramsSyncError).retryable).toBe(true);
    });
});

// Интеграционный тест: нужна чистая PostgreSQL с pgvector (PROGRAMS_ETL_TEST_ADMIN_URL).
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('CatalogWriterRepository', () => {
    const dbName = `etl_wr_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let writer: CatalogWriterRepository;
    let runId = '';

    const count = async (table: string, where = 'true'): Promise<number> =>
        Number(
            (await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`))
                .rows[0]?.n,
        );

    const newRun = async (): Promise<string> =>
        (
            await client.query<{ id: string }>(
                `INSERT INTO programs_sync_run (id, group_id, trigger, status)
                 VALUES (gen_random_uuid(), 'g1', 'scheduled', 'running') RETURNING id`,
            )
        ).rows[0]?.id ?? '';

    const apply = (
        operations: CatalogMutation[],
        run = runId,
    ): Promise<{ created: number; updated: number }> =>
        writer.applyPlan({
            runId: run,
            groupId: 'g1',
            plan: createCatalogMutationPlan(operations),
        });

    const fullPlan = (): CatalogMutation[] => [
        {
            kind: 'create',
            recordType: 'organization',
            localKey: 'org',
            data: { kind: 'university', name: 'Synergy' },
            sources: [source('book1:10', 2)],
        },
        {
            kind: 'create',
            recordType: 'location',
            localKey: 'loc',
            data: { organizationId: { ref: 'org' }, city: 'Москва', metro: 'Дубровка' },
            sources: [source('book1:10', 2)],
        },
        {
            kind: 'create',
            recordType: 'program',
            localKey: 'prog',
            data: {
                organizationId: { ref: 'org' },
                level: 'bachelor',
                title: 'Информатика',
                directionCode: '09.03.01',
                profile: 'Data',
                sections: [
                    { sectionType: 'about', text: 'О программе' },
                    { sectionType: 'faq', text: 'Вопрос один' },
                ],
            },
            sources: [source('book1:10', 2, 3), source('book2:20', 7)],
        },
        {
            kind: 'create',
            recordType: 'offer',
            localKey: 'offer',
            data: {
                programId: { ref: 'prog' },
                locationId: { ref: 'loc' },
                studyForm: 'full_time',
                baseEducation: 'grade11',
                tariff: 'base',
            },
            sources: [source('book1:10', 3)],
        },
        {
            kind: 'create',
            recordType: 'price',
            data: { offerId: { ref: 'offer' }, kind: 'total', amount: 100000, currency: 'RUB' },
            sources: [source('book1:10', 3)],
        },
        {
            kind: 'create',
            recordType: 'entrance_requirement',
            data: {
                programId: { ref: 'prog' },
                baseEducation: 'grade11',
                subject: 'Математика',
                minScore: 40,
            },
            sources: [source('book1:10', 4)],
        },
    ];

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
        writer = new CatalogWriterRepository(pool);
        runId = await newRun();
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates records, resolving local keys of dependencies', async () => {
        const result = await apply(fullPlan());
        expect(result).toEqual({ created: 6, updated: 0 });
        expect(await count('organization')).toBe(1);
        const offer = await client.query<{ program_id: string; location_id: string }>(
            `SELECT program_id, location_id FROM offer`,
        );
        const program = await client.query<{ id: string }>(`SELECT id FROM program`);
        const location = await client.query<{ id: string }>(`SELECT id FROM location`);
        expect(offer.rows[0]?.program_id).toBe(program.rows[0]?.id);
        expect(offer.rows[0]?.location_id).toBe(location.rows[0]?.id);
        expect(await count('price', `amount = 100000 AND currency = 'RUB'`)).toBe(1);
        expect(await count('entrance_requirement', 'min_score = 40')).toBe(1);
    });

    it('is idempotent: retrying the same plan creates no duplicates', async () => {
        const retryRun = await newRun();
        const result = await apply(fullPlan(), retryRun);
        expect(result).toEqual({ created: 0, updated: 6 });
        for (const table of [
            'organization',
            'location',
            'program',
            'offer',
            'price',
            'entrance_requirement',
        ]) {
            expect(await count(table)).toBe(1);
        }
        expect(await count('program_source')).toBe(3);
        expect(await count('program_source', `last_seen_run_id = '${retryRun}'`)).toBe(3);
        expect(await count('content_chunk')).toBe(2);
    });

    it('matches a titled program without direction code by ProgramMatchKey', async () => {
        const plan = (): CatalogMutation[] => [
            {
                kind: 'create',
                recordType: 'organization',
                localKey: 'org',
                data: { kind: 'university', name: 'Synergy' },
                sources: [source('book1:10', 2)],
            },
            {
                kind: 'create',
                recordType: 'program',
                data: {
                    organizationId: { ref: 'org' },
                    level: 'short_course',
                    title: 'Python для всех',
                },
                sources: [source('book1:10', 9)],
            },
        ];
        expect((await apply(plan())).created).toBe(1);
        expect(await apply(plan())).toEqual({ created: 0, updated: 2 });
        expect(await count('program', `title = 'Python для всех'`)).toBe(1);
    });

    it('updates only by recordId and changes only supplied fields', async () => {
        const id =
            (
                await client.query<{ id: string }>(
                    `SELECT id FROM program WHERE direction_code = '09.03.01'`,
                )
            ).rows[0]?.id ?? '';
        const result = await apply([
            {
                kind: 'update',
                recordType: 'program',
                recordId: id,
                data: { status: 'enrollment_closed' },
                sources: [source('book1:10', 2)],
            },
        ]);
        expect(result).toEqual({ created: 0, updated: 1 });
        const row = (
            await client.query<{ status: string; title: string }>(
                `SELECT status, title FROM program WHERE id = $1`,
                [id],
            )
        ).rows[0];
        expect(row).toEqual({ status: 'enrollment_closed', title: 'Информатика' });
    });

    it('fails an update for an unknown recordId without creating a record', async () => {
        const before = await count('program');
        const error = await apply([
            {
                kind: 'update',
                recordType: 'program',
                recordId: randomUUID(),
                data: { status: 'active' },
                sources: [source('book1:10', 2)],
            },
        ]).catch((e: unknown) => e);
        expect((error as ProgramsSyncError).code).toBe('RECORD_NOT_FOUND');
        expect(await count('program')).toBe(before);
    });

    it('keeps several sources per record and moves link metadata to the latest run', async () => {
        const rows = await client.query<{ spreadsheet_id: string; row_no: number }>(
            `SELECT ss.spreadsheet_id, rr.row_no
             FROM program_source ps
             JOIN raw_row rr ON rr.id = ps.raw_row_id
             JOIN source_sheet ss ON ss.id = rr.source_sheet_id
             JOIN program p ON p.id = ps.program_id
             WHERE p.direction_code = '09.03.01'
             ORDER BY ss.spreadsheet_id, rr.row_no`,
        );
        expect(rows.rows).toEqual([
            { spreadsheet_id: 'book1', row_no: 2 },
            { spreadsheet_id: 'book1', row_no: 3 },
            { spreadsheet_id: 'book2', row_no: 7 },
        ]);
        expect(await count('price_source')).toBe(1);
        expect(await count('entrance_requirement_source')).toBe(1);
        expect(await count('location_source')).toBe(1);
        expect(await count('offer_source')).toBe(1);
        expect(await count('organization_source')).toBe(1);
        expect(await count('program_source', `group_id = 'g1'`)).toBe(4);
    });

    it('splits content sections into chunks with provenance and rewrites them idempotently', async () => {
        const long = Array.from(
            { length: 6 },
            (_, i) => `Абзац ${String(i)} ${'я'.repeat(700)}`,
        ).join('\n\n');
        const id =
            (
                await client.query<{ id: string }>(
                    `SELECT id FROM program WHERE direction_code = '09.03.01'`,
                )
            ).rows[0]?.id ?? '';
        await apply([
            {
                kind: 'update',
                recordType: 'program',
                recordId: id,
                data: { sections: [{ sectionType: 'curriculum', text: long }] },
                sources: [source('book1:10', 2)],
            },
        ]);
        const chunks = await client.query<{
            chunk_no: number;
            source_row_id: string | null;
            organization_id: string;
            level: string;
        }>(
            `SELECT chunk_no, source_row_id, organization_id, level FROM content_chunk
             WHERE program_id = $1 AND section_type = 'curriculum' ORDER BY chunk_no`,
            [id],
        );
        expect(chunks.rows.length).toBeGreaterThan(1);
        expect(chunks.rows.map((c) => c.chunk_no)).toEqual(chunks.rows.map((_, i) => i));
        expect(chunks.rows.every((c) => c.source_row_id !== null && c.level === 'bachelor')).toBe(
            true,
        );
        const first = chunks.rows.length;
        await apply([
            {
                kind: 'update',
                recordType: 'program',
                recordId: id,
                data: { sections: [{ sectionType: 'curriculum', text: 'Коротко' }] },
                sources: [source('book1:10', 2)],
            },
        ]);
        expect(
            await count('content_chunk', `program_id = '${id}' AND section_type = 'curriculum'`),
        ).toBe(1);
        expect(first).toBeGreaterThan(1);
    });

    it('rejects unknown fields, section types and data columns', async () => {
        const base = {
            kind: 'create',
            recordType: 'organization',
            sources: [source('book1:10', 2)],
        } as const;
        const unknownField = await apply([
            { ...base, data: { kind: 'university', name: 'Z', evil: 'x' } },
        ]).catch((e: unknown) => e);
        expect((unknownField as ProgramsSyncError).code).toBe('INVALID_WORKFLOW_DATA');
        const badSection = await apply([
            {
                kind: 'create',
                recordType: 'program',
                data: {
                    organizationId: (
                        await client.query<{ id: string }>(`SELECT id FROM organization LIMIT 1`)
                    ).rows[0]?.id,
                    level: 'kids',
                    title: 'Секция',
                    sections: [{ sectionType: 'nope', text: 'x' }],
                },
                sources: [source('book1:10', 2)],
            },
        ]).catch((e: unknown) => e);
        expect((badSection as ProgramsSyncError).code).toBe('INVALID_WORKFLOW_DATA');
    });

    it('does not use a group-wide transaction: earlier operations stay when a later one fails', async () => {
        const run = await newRun();
        const error = await apply(
            [
                {
                    kind: 'create',
                    recordType: 'organization',
                    data: { kind: 'college', name: 'Persisted College' },
                    sources: [source('book1:10', 11)],
                },
                {
                    kind: 'create',
                    recordType: 'organization',
                    data: { kind: 'not-a-kind', name: 'Broken' },
                    sources: [source('book1:10', 12)],
                },
            ],
            run,
        ).catch((e: unknown) => e);
        expect((error as ProgramsSyncError).code).toBe('MUTATION_CONFLICT');
        expect(await count('organization', `name = 'Persisted College'`)).toBe(1);
        expect(await count('organization', `name = 'Broken'`)).toBe(0);
    });

    it('never deletes: records absent from the plan remain', async () => {
        const before = await count('program');
        await apply([
            {
                kind: 'create',
                recordType: 'organization',
                data: { kind: 'university', name: 'Synergy' },
                sources: [source('book1:10', 2)],
            },
        ]);
        expect(await count('program')).toBe(before);
    });
});
