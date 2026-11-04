import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type DatabasePool, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type { CatalogRecordType } from '../application/models/catalog-mutation';
import { CATALOG_RECORD_TYPES } from '../application/models/catalog-mutation';
import type {
    CatalogRecordDetails,
    CatalogRecordSummary,
    CatalogSearchQuery,
    GetCatalogRecordQuery,
    SourceRecordQuery,
} from '../application/models/catalog-query';
import {
    createSourceReference,
    type SourceReference,
} from '../application/models/source-fingerprint';
import type { CatalogQueryPort } from '../application/ports/programs-etl.ports';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const SOURCE_LIST_LIMIT = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** content_chunk.section_type values that can be read as section text. */
const SECTION_TYPES: ReadonlySet<string> = new Set([
    'about',
    'curriculum',
    'careers',
    'course_goal',
    'usp',
    'faq',
    'people',
    'cases',
    'practice',
]);

type MatchKind = 'uuid' | 'exact' | 'text';

interface KeyField {
    readonly name: string;
    readonly column: string;
    readonly match: MatchKind;
}

interface TypeConfig {
    readonly table: string;
    readonly sourceTable: string;
    readonly sourceKey: string;
    readonly key: readonly KeyField[];
}

const f = (name: string, column: string, match: MatchKind): KeyField => ({ name, column, match });

/** Table and column names never leave this adapter and never come from the caller. */
const TYPES: Readonly<Record<CatalogRecordType, TypeConfig>> = {
    organization: {
        table: 'organization',
        sourceTable: 'organization_source',
        sourceKey: 'organization_id',
        key: [
            f('kind', 'kind', 'exact'),
            f('name', 'name', 'text'),
            f('parentId', 'parent_id', 'uuid'),
        ],
    },
    faculty: {
        table: 'faculty',
        sourceTable: 'faculty_source',
        sourceKey: 'faculty_id',
        key: [f('organizationId', 'organization_id', 'uuid'), f('name', 'name', 'text')],
    },
    location: {
        table: 'location',
        sourceTable: 'location_source',
        sourceKey: 'location_id',
        key: [
            f('organizationId', 'organization_id', 'uuid'),
            f('city', 'city', 'text'),
            f('metro', 'metro', 'text'),
            f('address', 'address', 'text'),
        ],
    },
    program: {
        table: 'program',
        sourceTable: 'program_source',
        sourceKey: 'program_id',
        key: [
            f('organizationId', 'organization_id', 'uuid'),
            f('level', 'level', 'exact'),
            f('directionCode', 'direction_code', 'exact'),
            f('profile', 'profile', 'text'),
            f('qualification', 'qualification', 'text'),
            f('title', 'title', 'text'),
        ],
    },
    offer: {
        table: 'offer',
        sourceTable: 'offer_source',
        sourceKey: 'offer_id',
        key: [
            f('programId', 'program_id', 'uuid'),
            f('locationId', 'location_id', 'uuid'),
            f('studyForm', 'study_form', 'exact'),
            f('baseEducation', 'base_education', 'exact'),
            f('tariff', 'tariff', 'exact'),
        ],
    },
    price: {
        table: 'price',
        sourceTable: 'price_source',
        sourceKey: 'price_id',
        key: [
            f('offerId', 'offer_id', 'uuid'),
            f('kind', 'kind', 'exact'),
            f('condition', 'condition', 'text'),
        ],
    },
    entrance_requirement: {
        table: 'entrance_requirement',
        sourceTable: 'entrance_requirement_source',
        sourceKey: 'entrance_requirement_id',
        key: [
            f('programId', 'program_id', 'uuid'),
            f('baseEducation', 'base_education', 'exact'),
            f('subject', 'subject', 'text'),
        ],
    },
};

const sourceRowSchema = z.object({
    id: z.string(),
    spreadsheet_id: z.string(),
    sheet_id: z.string(),
    row_no: z.number(),
});

const summaryRowSchema = z.object({ id: z.string() }).catchall(z.string().nullable());

const detailRowSchema = z.object({ data: z.record(z.string(), z.unknown()) });

const sectionRowSchema = z.object({ text: z.string() });

const HIDDEN_COLUMNS: ReadonlySet<string> = new Set(['search_vector', 'embedding']);

function invalid(message: string): ProgramsSyncError {
    return new ProgramsSyncError('INVALID_QUERY', message);
}

function parseSourceId(sourceId: string): { spreadsheetId: string; sheetId: string } {
    const separator = sourceId.lastIndexOf(':');
    const sheetId = sourceId.slice(separator + 1);
    if (separator < 1 || !/^\d+$/.test(sheetId)) {
        throw invalid(`Malformed source id: ${sourceId}`);
    }
    return { spreadsheetId: sourceId.slice(0, separator), sheetId };
}

function camelCase(column: string): string {
    return column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function boundedLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isInteger(limit) || limit < 1) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
}

/**
 * Read-only query adapter over the existing catalog. Table names, columns and filters are
 * fixed here; callers only supply values, which are always bound as parameters.
 */
@Injectable()
export class PostgresCatalogQueryRepository implements CatalogQueryPort {
    private readonly logger = new Logger(PostgresCatalogQueryRepository.name);

    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    async searchRecords(query: CatalogSearchQuery): Promise<CatalogRecordSummary[]> {
        const config = this.config(query.recordType);
        const entries = Object.entries(query.criteria);
        if (entries.length === 0) throw invalid('Catalog search needs at least one criterion');
        const filters: FragmentSqlToken[] = [];
        for (const [name, value] of entries) {
            const filter = this.criterion(query.recordType, config, name, value);
            if (filter === null) return [];
            filters.push(filter);
        }
        return this.guard(() =>
            this.summaries(query.recordType, filters, boundedLimit(query.limit)),
        );
    }

    async getRecord(query: GetCatalogRecordQuery): Promise<CatalogRecordDetails | null> {
        const config = this.config(query.recordType);
        if (query.section !== undefined) {
            if (query.recordType !== 'program' || !SECTION_TYPES.has(query.section)) {
                throw invalid(`Unsupported section "${query.section}"`);
            }
        }
        if (!UUID_PATTERN.test(query.recordId)) return null;

        return this.guard(async () => {
            const raw = await this.pool.maybeOne(sql.unsafe`
                SELECT to_jsonb(t) AS data
                FROM ${sql.identifier([config.table])} t
                WHERE t.id = ${query.recordId}::uuid
            `);
            if (raw === null) return null;
            const fields: Record<string, unknown> = {};
            for (const [column, value] of Object.entries(detailRowSchema.parse(raw).data)) {
                if (!HIDDEN_COLUMNS.has(column)) fields[camelCase(column)] = value;
            }
            const sources = await this.sourcesOf(query.recordType, [query.recordId]);
            const details = {
                recordType: query.recordType,
                recordId: query.recordId,
                fields,
                sources: sources.get(query.recordId) ?? [],
            };
            if (query.section === undefined) return details;
            const sectionText = await this.sectionText(query.recordId, query.section);
            return sectionText === undefined ? details : { ...details, sectionText };
        });
    }

    async listSourceRecords(query: SourceRecordQuery): Promise<CatalogRecordSummary[]> {
        const { spreadsheetId, sheetId } = parseSourceId(query.sourceId);
        return this.guard(async () => {
            const result: CatalogRecordSummary[] = [];
            for (const recordType of CATALOG_RECORD_TYPES) {
                const config = TYPES[recordType];
                const rowFilter =
                    query.rowNo === undefined
                        ? sql.fragment``
                        : sql.fragment`AND rr.row_no = ${query.rowNo}`;
                const filter = sql.fragment`EXISTS (
                    SELECT 1
                    FROM ${sql.identifier([config.sourceTable])} s
                    JOIN raw_row rr ON rr.id = s.raw_row_id
                    JOIN source_sheet ss ON ss.id = rr.source_sheet_id
                    WHERE s.${sql.identifier([config.sourceKey])} = t.id
                      AND ss.spreadsheet_id = ${spreadsheetId}
                      AND ss.sheet_id = ${sheetId}::bigint
                      ${rowFilter}
                )`;
                result.push(...(await this.summaries(recordType, [filter], SOURCE_LIST_LIMIT)));
            }
            return result;
        });
    }

    private config(recordType: CatalogRecordType): TypeConfig {
        const config = (TYPES as Partial<Record<string, TypeConfig>>)[recordType];
        if (config === undefined) throw invalid(`Unsupported record type: ${recordType}`);
        return config;
    }

    /** `null` means the criterion can match nothing (malformed uuid). */
    private criterion(
        recordType: CatalogRecordType,
        config: TypeConfig,
        name: string,
        value: string | number | boolean,
    ): FragmentSqlToken | null {
        const text = String(value).trim();
        if (text === '') throw invalid(`Empty search criterion "${name}"`);
        if (name === 'sourceId') {
            const { spreadsheetId, sheetId } = parseSourceId(text);
            return sql.fragment`EXISTS (
                SELECT 1
                FROM ${sql.identifier([config.sourceTable])} s
                JOIN raw_row rr ON rr.id = s.raw_row_id
                JOIN source_sheet ss ON ss.id = rr.source_sheet_id
                WHERE s.${sql.identifier([config.sourceKey])} = t.id
                  AND ss.spreadsheet_id = ${spreadsheetId}
                  AND ss.sheet_id = ${sheetId}::bigint
            )`;
        }
        const field = config.key.find((candidate) => candidate.name === name);
        if (field === undefined) {
            const supported = [...config.key.map((candidate) => candidate.name), 'sourceId'];
            throw invalid(
                `Unsupported search criterion "${name}" for ${recordType}. Supported: ${supported.join(', ')}`,
            );
        }
        const column = sql.identifier(['t', field.column]);
        switch (field.match) {
            case 'uuid':
                return UUID_PATTERN.test(text) ? sql.fragment`${column} = ${text}::uuid` : null;
            case 'exact':
                return sql.fragment`${column} = ${text}`;
            case 'text':
                return sql.fragment`${column} ILIKE ${`%${escapeLike(text)}%`}`;
        }
    }

    private async summaries(
        recordType: CatalogRecordType,
        filters: readonly FragmentSqlToken[],
        limit: number,
    ): Promise<CatalogRecordSummary[]> {
        const config = TYPES[recordType];
        const columns = sql.join(
            config.key.map((field) => {
                const column = sql.identifier(['t', field.column]);
                return sql.fragment`${column}::text AS ${sql.identifier([field.name])}`;
            }),
            sql.fragment`, `,
        );
        const where = sql.join(filters, sql.fragment` AND `);
        const rows = await this.pool.any(sql.unsafe`
            SELECT t.id::text AS id, ${columns}
            FROM ${sql.identifier([config.table])} t
            WHERE ${where}
            ORDER BY t.created_at, t.id
            LIMIT ${limit}
        `);
        const parsed = rows.map((row) => summaryRowSchema.parse(row));
        const sources = await this.sourcesOf(
            recordType,
            parsed.map((row) => row.id),
        );
        return parsed.map((row) => ({
            recordType,
            recordId: row.id,
            naturalKey: Object.fromEntries(
                config.key.map((field) => [field.name, row[field.name] ?? null]),
            ),
            sources: sources.get(row.id) ?? [],
        }));
    }

    private async sourcesOf(
        recordType: CatalogRecordType,
        ids: readonly string[],
    ): Promise<Map<string, SourceReference[]>> {
        const result = new Map<string, SourceReference[]>();
        if (ids.length === 0) return result;
        const config = TYPES[recordType];
        const rows = await this.pool.any(sql.unsafe`
            SELECT s.${sql.identifier([config.sourceKey])}::text AS id,
                   ss.spreadsheet_id,
                   ss.sheet_id::text AS sheet_id,
                   rr.row_no
            FROM ${sql.identifier([config.sourceTable])} s
            JOIN raw_row rr ON rr.id = s.raw_row_id
            JOIN source_sheet ss ON ss.id = rr.source_sheet_id
            WHERE s.${sql.identifier([config.sourceKey])} = ANY(${sql.array([...ids], 'uuid')})
            ORDER BY ss.spreadsheet_id, ss.sheet_id, rr.row_no
        `);
        const grouped = new Map<string, Map<string, number[]>>();
        for (const raw of rows) {
            const row = sourceRowSchema.parse(raw);
            const bySource = grouped.get(row.id) ?? new Map<string, number[]>();
            const sourceId = `${row.spreadsheet_id}:${row.sheet_id}`;
            bySource.set(sourceId, [...(bySource.get(sourceId) ?? []), row.row_no]);
            grouped.set(row.id, bySource);
        }
        for (const [id, bySource] of grouped) {
            result.set(
                id,
                [...bySource].map(([sourceId, rowNumbers]) =>
                    createSourceReference({ sourceId, rowNumbers }),
                ),
            );
        }
        return result;
    }

    private async sectionText(programId: string, section: string): Promise<string | undefined> {
        const rows = await this.pool.any(sql.unsafe`
            SELECT text
            FROM content_chunk
            WHERE program_id = ${programId}::uuid AND section_type = ${section}
            ORDER BY chunk_no
        `);
        if (rows.length === 0) return undefined;
        return rows.map((row) => sectionRowSchema.parse(row).text).join('\n\n');
    }

    private async guard<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof ProgramsSyncError) throw error;
            // Only the error class and message: query parameters must not reach logs.
            this.logger.error(
                `Catalog query failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
            );
            throw new ProgramsSyncError('CATALOG_UNAVAILABLE', 'Catalog query failed');
        }
    }
}
