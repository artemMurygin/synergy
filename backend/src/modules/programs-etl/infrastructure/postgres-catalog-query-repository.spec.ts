import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import { PostgresCatalogQueryRepository } from './postgres-catalog-query-repository';

describe('PostgresCatalogQueryRepository (no database)', () => {
    it('rejects an unknown criterion with INVALID_QUERY and lists the supported ones', async () => {
        const repository = new PostgresCatalogQueryRepository({
            any: () => Promise.resolve([]),
        } as unknown as DatabasePool);

        const error = await repository
            .searchRecords({ recordType: 'program', criteria: { name: 'Информатика' } })
            .catch((e: unknown) => e);

        expect(error).toMatchObject({ code: 'INVALID_QUERY' });
        expect((error as Error).message).toContain('Supported:');
        expect((error as Error).message).toContain('title');
    });

    it('exposes the three read methods and no write methods', () => {
        const methods = Object.getOwnPropertyNames(PostgresCatalogQueryRepository.prototype);
        expect(methods).toEqual(
            expect.arrayContaining(['searchRecords', 'getRecord', 'listSourceRecords']),
        );
        expect(
            methods.filter((name) =>
                /apply|insert|update|delete|write|save|create|upsert/i.test(name),
            ),
        ).toEqual([]);
    });

    it('maps driver failures to retryable CATALOG_UNAVAILABLE', async () => {
        const broken = {
            any: () => Promise.reject(new Error('connection refused')),
            maybeOne: () => Promise.reject(new Error('connection refused')),
        } as unknown as DatabasePool;
        const repository = new PostgresCatalogQueryRepository(broken);
        const error = await repository
            .searchRecords({ recordType: 'program', criteria: { directionCode: '09.03.01' } })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ProgramsSyncError);
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

describe.skipIf(adminUrl === undefined)('PostgresCatalogQueryRepository', () => {
    const dbName = `etl_cat_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let repository: PostgresCatalogQueryRepository;
    const ids = {
        org: '',
        otherOrg: '',
        codedProgram: '',
        titledProgram: '',
        offer: '',
        price: '',
    };

    const one = async (text: string, params: unknown[] = []): Promise<string> =>
        (await client.query<{ id: string }>(text, params)).rows[0]?.id ?? '';

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
        repository = new PostgresCatalogQueryRepository(pool);

        ids.org = await one(
            `INSERT INTO organization (kind, name) VALUES ('university', 'Synergy') RETURNING id`,
        );
        ids.otherOrg = await one(
            `INSERT INTO organization (kind, name) VALUES ('college', 'Other') RETURNING id`,
        );
        const sheet = await one(
            `INSERT INTO source_sheet (spreadsheet_id, sheet_id, title) VALUES ('book1', 10, 'A') RETURNING id`,
        );
        const row5 = await one(
            `INSERT INTO raw_row (source_sheet_id, row_no, data, row_hash) VALUES ($1, 5, '{}', 'h5') RETURNING id`,
            [sheet],
        );
        const row6 = await one(
            `INSERT INTO raw_row (source_sheet_id, row_no, data, row_hash) VALUES ($1, 6, '{}', 'h6') RETURNING id`,
            [sheet],
        );
        ids.codedProgram = await one(
            `INSERT INTO program (organization_id, level, title, direction_code, profile, qualification)
             VALUES ($1, 'bachelor', 'Информатика', '09.03.01', 'Data', 'bachelor') RETURNING id`,
            [ids.org],
        );
        ids.titledProgram = await one(
            `INSERT INTO program (organization_id, level, title) VALUES ($1, 'short_course', 'Python для всех') RETURNING id`,
            [ids.org],
        );
        for (let i = 0; i < 30; i++) {
            await client.query(
                `INSERT INTO program (organization_id, level, title) VALUES ($1, 'kids', $2)`,
                [ids.otherOrg, `Кружок ${String(i)}`],
            );
        }
        ids.offer = await one(
            `INSERT INTO offer (program_id, study_form, base_education) VALUES ($1, 'online', 'any') RETURNING id`,
            [ids.codedProgram],
        );
        ids.price = await one(
            `INSERT INTO price (offer_id, kind, amount, currency) VALUES ($1, 'total', 100000, 'RUB') RETURNING id`,
            [ids.offer],
        );
        const run = await one(
            `INSERT INTO programs_sync_run (id, group_id, trigger, status) VALUES (gen_random_uuid(), 'g1', 'scheduled', 'running') RETURNING id`,
        );
        const link = (table: string, fk: string, id: string, raw: string): Promise<unknown> =>
            client.query(
                `INSERT INTO ${table} (${fk}, raw_row_id, group_id, last_seen_run_id) VALUES ($1, $2, 'g1', $3)`,
                [id, raw, run],
            );
        await link('program_source', 'program_id', ids.codedProgram, row5);
        await link('program_source', 'program_id', ids.codedProgram, row6);
        await link('program_source', 'program_id', ids.titledProgram, row6);
        await link('offer_source', 'offer_id', ids.offer, row5);
        await client.query(
            `INSERT INTO content_chunk (program_id, organization_id, level, section_type, chunk_no, text)
             VALUES ($1, $2, 'bachelor', 'about', 0, 'Первая часть'),
                    ($1, $2, 'bachelor', 'about', 1, 'Вторая часть'),
                    ($1, $2, 'bachelor', 'faq', 0, 'Вопросы')`,
            [ids.codedProgram, ids.org],
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

    describe('searchRecords', () => {
        it('returns ProgramMatchKey fields and linked sources of a coded program', async () => {
            const result = await repository.searchRecords({
                recordType: 'program',
                criteria: { organizationId: ids.org, directionCode: '09.03.01' },
            });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                recordType: 'program',
                recordId: ids.codedProgram,
                naturalKey: {
                    organizationId: ids.org,
                    level: 'bachelor',
                    directionCode: '09.03.01',
                    profile: 'Data',
                    qualification: 'bachelor',
                    title: 'Информатика',
                },
                sources: [{ sourceId: 'book1:10', rowNumbers: [5, 6] }],
            });
        });

        it('matches a titled program by a title fragment, case-insensitively', async () => {
            const result = await repository.searchRecords({
                recordType: 'program',
                criteria: { title: 'python' },
            });
            expect(result.map((r) => r.recordId)).toEqual([ids.titledProgram]);
            expect(result[0]?.naturalKey.directionCode).toBeNull();
        });

        it('bounds the number of candidates', async () => {
            const defaults = await repository.searchRecords({
                recordType: 'program',
                criteria: { level: 'kids' },
            });
            expect(defaults).toHaveLength(10);
            const capped = await repository.searchRecords({
                recordType: 'program',
                criteria: { level: 'kids' },
                limit: 1000,
            });
            expect(capped.length).toBeLessThanOrEqual(20);
            const small = await repository.searchRecords({
                recordType: 'program',
                criteria: { level: 'kids' },
                limit: 3,
            });
            expect(small).toHaveLength(3);
        });

        it('finds records by source id and by source id with other criteria', async () => {
            const bySource = await repository.searchRecords({
                recordType: 'program',
                criteria: { sourceId: 'book1:10' },
            });
            expect(bySource.map((r) => r.recordId).sort()).toEqual(
                [ids.codedProgram, ids.titledProgram].sort(),
            );
            const none = await repository.searchRecords({
                recordType: 'program',
                criteria: { sourceId: 'book1:99' },
            });
            expect(none).toEqual([]);
        });

        it('searches other record types by their natural keys', async () => {
            const offers = await repository.searchRecords({
                recordType: 'offer',
                criteria: { programId: ids.codedProgram },
            });
            expect(offers).toHaveLength(1);
            expect(offers[0]?.naturalKey).toMatchObject({
                programId: ids.codedProgram,
                studyForm: 'online',
                baseEducation: 'any',
                tariff: null,
            });
            expect(offers[0]?.sources).toEqual([{ sourceId: 'book1:10', rowNumbers: [5] }]);
            const prices = await repository.searchRecords({
                recordType: 'price',
                criteria: { offerId: ids.offer },
            });
            expect(prices[0]?.recordId).toBe(ids.price);
            expect(prices[0]?.sources).toEqual([]);
        });

        it('returns an empty list for a malformed uuid criterion', async () => {
            expect(
                await repository.searchRecords({
                    recordType: 'program',
                    criteria: { organizationId: 'not-a-uuid' },
                }),
            ).toEqual([]);
        });

        it('rejects unknown or empty criteria instead of building arbitrary filters', async () => {
            await expect(
                repository.searchRecords({
                    recordType: 'program',
                    criteria: { 'title; DROP TABLE program': 'x' },
                }),
            ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
            await expect(
                repository.searchRecords({ recordType: 'program', criteria: {} }),
            ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
        });

        it('treats LIKE wildcards in a name fragment literally', async () => {
            expect(
                await repository.searchRecords({
                    recordType: 'program',
                    criteria: { title: '%' },
                }),
            ).toEqual([]);
        });
    });

    describe('getRecord', () => {
        it('returns fields and sources without section text by default', async () => {
            const record = await repository.getRecord({
                recordType: 'program',
                recordId: ids.codedProgram,
            });
            expect(record).not.toBeNull();
            expect(record?.fields).toMatchObject({
                title: 'Информатика',
                directionCode: '09.03.01',
                level: 'bachelor',
            });
            expect(record?.fields).not.toHaveProperty('searchVector');
            expect(record?.sources).toEqual([{ sourceId: 'book1:10', rowNumbers: [5, 6] }]);
            expect(record?.sectionText).toBeUndefined();
        });

        it('returns the text of exactly the requested section ordered by chunk', async () => {
            const record = await repository.getRecord({
                recordType: 'program',
                recordId: ids.codedProgram,
                section: 'about',
            });
            expect(record?.sectionText).toBe('Первая часть\n\nВторая часть');
            const faq = await repository.getRecord({
                recordType: 'program',
                recordId: ids.codedProgram,
                section: 'faq',
            });
            expect(faq?.sectionText).toBe('Вопросы');
        });

        it('rejects an unknown section', async () => {
            await expect(
                repository.getRecord({
                    recordType: 'program',
                    recordId: ids.codedProgram,
                    section: 'secrets',
                }),
            ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
        });

        it('returns null for a missing or malformed record id', async () => {
            expect(
                await repository.getRecord({ recordType: 'program', recordId: randomUUID() }),
            ).toBeNull();
            expect(
                await repository.getRecord({ recordType: 'program', recordId: 'nope' }),
            ).toBeNull();
        });

        it('loads records of non-program types', async () => {
            const price = await repository.getRecord({ recordType: 'price', recordId: ids.price });
            expect(price?.fields).toMatchObject({ kind: 'total', currency: 'RUB' });
        });
    });

    describe('listSourceRecords', () => {
        it('lists all records linked to a source across record types', async () => {
            const result = await repository.listSourceRecords({ sourceId: 'book1:10' });
            const keys = result.map((r) => `${r.recordType}:${r.recordId}`).sort();
            expect(keys).toEqual(
                [
                    `program:${ids.codedProgram}`,
                    `program:${ids.titledProgram}`,
                    `offer:${ids.offer}`,
                ].sort(),
            );
        });

        it('narrows the search to a source row', async () => {
            const row5 = await repository.listSourceRecords({ sourceId: 'book1:10', rowNo: 5 });
            expect(row5.map((r) => r.recordId).sort()).toEqual(
                [ids.codedProgram, ids.offer].sort(),
            );
            const row6 = await repository.listSourceRecords({ sourceId: 'book1:10', rowNo: 6 });
            expect(row6.map((r) => r.recordId).sort()).toEqual(
                [ids.codedProgram, ids.titledProgram].sort(),
            );
        });

        it('returns an empty list for an unknown source and rejects a malformed source id', async () => {
            expect(await repository.listSourceRecords({ sourceId: 'book9:1' })).toEqual([]);
            await expect(
                repository.listSourceRecords({ sourceId: 'no-sheet' }),
            ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
        });
    });
});
