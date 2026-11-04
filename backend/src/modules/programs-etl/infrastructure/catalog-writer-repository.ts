import { Inject, Injectable, Logger } from '@nestjs/common';
import {
    DataIntegrityError,
    IntegrityConstraintViolationError,
    sql,
    type CommonQueryMethods,
    type DatabasePool,
    type FragmentSqlToken,
} from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type {
    CatalogMutation,
    CatalogMutationPlan,
    CatalogRecordType,
} from '../application/models/catalog-mutation';
import { buildProgramMatchKey } from '../application/models/program-match-key';
import type { GroupId } from '../application/models/programs-group';
import type { SourceReference } from '../application/models/source-fingerprint';
import type { CatalogWriterPort } from '../application/ports/programs-etl.ports';
import { CONTENT_SECTION_TYPES } from './programs-agent-contract';

type ColumnType = 'text' | 'uuid' | 'int' | 'bool' | 'date' | 'numeric';

interface Field {
    readonly column: string;
    readonly type: ColumnType;
}

interface TypeConfig {
    readonly table: string;
    readonly sourceTable: string;
    readonly sourceKey: string;
    readonly fields: Readonly<Partial<Record<string, Field>>>;
    /** Fields of the natural (unique) key used for idempotent create. */
    readonly naturalKey: readonly string[];
}

const f = (column: string, type: ColumnType = 'text'): Field => ({ column, type });

/** Tables and columns are fixed here; plan data only supplies bound values. */
const TYPES: Readonly<Record<CatalogRecordType, TypeConfig>> = {
    organization: {
        table: 'organization',
        sourceTable: 'organization_source',
        sourceKey: 'organization_id',
        fields: {
            kind: f('kind'),
            name: f('name'),
            parentId: f('parent_id', 'uuid'),
            hasOwnRequisites: f('has_own_requisites', 'bool'),
        },
        naturalKey: ['kind', 'name'],
    },
    faculty: {
        table: 'faculty',
        sourceTable: 'faculty_source',
        sourceKey: 'faculty_id',
        fields: { organizationId: f('organization_id', 'uuid'), name: f('name') },
        naturalKey: ['organizationId', 'name'],
    },
    location: {
        table: 'location',
        sourceTable: 'location_source',
        sourceKey: 'location_id',
        fields: {
            organizationId: f('organization_id', 'uuid'),
            city: f('city'),
            metro: f('metro'),
            address: f('address'),
        },
        naturalKey: ['organizationId', 'city', 'metro', 'address'],
    },
    program: {
        table: 'program',
        sourceTable: 'program_source',
        sourceKey: 'program_id',
        fields: {
            organizationId: f('organization_id', 'uuid'),
            facultyId: f('faculty_id', 'uuid'),
            level: f('level'),
            title: f('title'),
            directionCode: f('direction_code'),
            profile: f('profile'),
            qualification: f('qualification'),
            isStateFunded: f('is_state_funded', 'bool'),
            isAccredited: f('is_accredited', 'bool'),
            status: f('status'),
            crmName: f('crm_name'),
            crmProductGroup: f('crm_product_group'),
        },
        naturalKey: [],
    },
    offer: {
        table: 'offer',
        sourceTable: 'offer_source',
        sourceKey: 'offer_id',
        fields: {
            programId: f('program_id', 'uuid'),
            locationId: f('location_id', 'uuid'),
            studyForm: f('study_form'),
            baseEducation: f('base_education'),
            tariff: f('tariff'),
            schedule: f('schedule'),
            durationMonths: f('duration_months', 'int'),
            hours: f('hours', 'int'),
            startDate: f('start_date', 'date'),
            enrollUntil: f('enroll_until', 'date'),
            validTo: f('valid_to', 'date'),
            notes: f('notes'),
        },
        naturalKey: ['programId', 'locationId', 'studyForm', 'baseEducation', 'tariff'],
    },
    price: {
        table: 'price',
        sourceTable: 'price_source',
        sourceKey: 'price_id',
        fields: {
            offerId: f('offer_id', 'uuid'),
            kind: f('kind'),
            amount: f('amount', 'numeric'),
            currency: f('currency'),
            condition: f('condition'),
        },
        naturalKey: ['offerId', 'kind', 'condition'],
    },
    entrance_requirement: {
        table: 'entrance_requirement',
        sourceTable: 'entrance_requirement_source',
        sourceKey: 'entrance_requirement_id',
        fields: {
            programId: f('program_id', 'uuid'),
            baseEducation: f('base_education'),
            subject: f('subject'),
            minScore: f('min_score', 'int'),
            isRequired: f('is_required', 'bool'),
        },
        naturalKey: ['programId', 'baseEducation', 'subject'],
    },
};

const SECTION_TYPES: ReadonlySet<string> = new Set(CONTENT_SECTION_TYPES);

const MAX_CHUNK_LENGTH = 1500;

const refSchema = z.object({ ref: z.string().min(1) }).strict();
const sectionsSchema = z.array(
    z.object({ sectionType: z.string().min(1), text: z.string().trim().min(1) }).strict(),
);
const idRowSchema = z.object({ id: z.string() });
const programRowSchema = z.object({ organization_id: z.string(), level: z.string() });

type Scalar = string | number | boolean | null;

interface ResolvedOperation {
    readonly mutation: CatalogMutation;
    readonly values: ReadonlyMap<string, Scalar>;
    readonly sections: readonly { sectionType: string; text: string }[];
}

function invalid(message: string): ProgramsSyncError {
    return new ProgramsSyncError('INVALID_WORKFLOW_DATA', message);
}

function parseSourceId(sourceId: string): { spreadsheetId: string; sheetId: string } {
    const separator = sourceId.lastIndexOf(':');
    const sheetId = sourceId.slice(separator + 1);
    if (separator < 1 || !/^\d+$/.test(sheetId)) throw invalid(`Malformed source id: ${sourceId}`);
    return { spreadsheetId: sourceId.slice(0, separator), sheetId };
}

function cast(type: ColumnType, value: Scalar): FragmentSqlToken {
    switch (type) {
        case 'text':
            return sql.fragment`${value}::text`;
        case 'uuid':
            return sql.fragment`${value}::uuid`;
        case 'int':
            return sql.fragment`${value}::integer`;
        case 'bool':
            return sql.fragment`${value}::boolean`;
        case 'date':
            return sql.fragment`${value}::date`;
        case 'numeric':
            return sql.fragment`${value}::numeric`;
    }
}

/** Infrastructure splitting of a content section into `content_chunk` texts. */
export function splitSectionText(text: string): string[] {
    const chunks: string[] = [];
    let current = '';
    const flush = (): void => {
        if (current.length > 0) chunks.push(current);
        current = '';
    };
    for (const paragraph of text.split(/\n{2,}/)) {
        const trimmed = paragraph.trim();
        if (trimmed === '') continue;
        for (let start = 0; start < trimmed.length; start += MAX_CHUNK_LENGTH) {
            const piece = trimmed.slice(start, start + MAX_CHUNK_LENGTH);
            if (current.length > 0 && current.length + piece.length + 2 > MAX_CHUNK_LENGTH) flush();
            current = current.length === 0 ? piece : `${current}\n\n${piece}`;
        }
    }
    flush();
    return chunks;
}

/**
 * Applies a mutation plan to the existing catalog. Every operation is written in its own
 * transaction (no group-wide transaction); nothing is ever deleted from the catalog.
 */
@Injectable()
export class CatalogWriterRepository implements CatalogWriterPort {
    private readonly logger = new Logger(CatalogWriterRepository.name);

    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    async applyPlan(input: {
        runId: string;
        groupId: GroupId;
        plan: CatalogMutationPlan;
    }): Promise<{ created: number; updated: number }> {
        const operations = input.plan.operations.map((mutation) => this.validate(mutation));
        this.checkLocalKeys(operations);

        const ids = new Map<string, string>();
        let created = 0;
        let updated = 0;
        try {
            for (const operation of operations) {
                const outcome = await this.pool.transaction((tx) =>
                    this.applyOperation(tx, operation, ids, input.runId, input.groupId),
                );
                if (outcome.created) created += 1;
                else updated += 1;
                if (operation.mutation.localKey !== undefined) {
                    ids.set(operation.mutation.localKey, outcome.id);
                }
            }
        } catch (error) {
            throw this.toSyncError(error);
        }
        this.logger.log(
            `Plan applied: operations=${String(operations.length)} created=${String(created)} updated=${String(updated)}`,
        );
        return { created, updated };
    }

    private validate(mutation: CatalogMutation): ResolvedOperation {
        const config = TYPES[mutation.recordType] as TypeConfig | undefined;
        if (config === undefined) throw invalid(`Unsupported record type: ${mutation.recordType}`);
        const values = new Map<string, Scalar>();
        let sections: { sectionType: string; text: string }[] = [];
        for (const [name, value] of Object.entries(mutation.data)) {
            if (name === 'sections') {
                if (mutation.recordType !== 'program') {
                    throw invalid('Content sections belong to program operations only');
                }
                const parsed = sectionsSchema.safeParse(value);
                if (!parsed.success) throw invalid('Invalid content sections');
                for (const section of parsed.data) {
                    if (!SECTION_TYPES.has(section.sectionType)) {
                        throw invalid(`Unsupported section type: ${section.sectionType}`);
                    }
                }
                sections = parsed.data;
                continue;
            }
            if (!(name in config.fields)) {
                throw invalid(`Unsupported field "${name}" for ${mutation.recordType}`);
            }
            if (refSchema.safeParse(value).success) continue;
            if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
                throw invalid(`Unsupported value for "${name}"`);
            }
            values.set(name, value as Scalar);
        }
        return { mutation, values, sections };
    }

    /** Every `{ ref }` must point at the localKey of an earlier operation. */
    private checkLocalKeys(operations: readonly ResolvedOperation[]): void {
        const known = new Set<string>();
        for (const { mutation } of operations) {
            for (const value of Object.values(mutation.data)) {
                const ref = refSchema.safeParse(value);
                if (ref.success && !known.has(ref.data.ref)) {
                    throw invalid(`Unresolved local key: ${ref.data.ref}`);
                }
            }
            if (mutation.localKey !== undefined) known.add(mutation.localKey);
        }
    }

    private resolve(
        operation: ResolvedOperation,
        ids: ReadonlyMap<string, string>,
    ): ResolvedOperation {
        const values = new Map(operation.values);
        for (const [name, value] of Object.entries(operation.mutation.data)) {
            const ref = refSchema.safeParse(value);
            if (!ref.success) continue;
            const id = ids.get(ref.data.ref);
            if (id === undefined) throw invalid(`Unresolved local key: ${ref.data.ref}`);
            values.set(name, id);
        }
        return { ...operation, values };
    }

    private async applyOperation(
        tx: CommonQueryMethods,
        raw: ResolvedOperation,
        ids: ReadonlyMap<string, string>,
        runId: string,
        groupId: string,
    ): Promise<{ id: string; created: boolean }> {
        const operation = this.resolve(raw, ids);
        const { mutation } = operation;
        const config = TYPES[mutation.recordType];

        let id: string;
        let created = false;
        if (mutation.kind === 'update') {
            if (mutation.recordId === undefined) throw invalid('Update requires recordId');
            await this.update(tx, config, mutation.recordId, operation.values);
            id = mutation.recordId;
        } else {
            const existing = await this.findByNaturalKey(tx, mutation.recordType, operation.values);
            if (existing === null) {
                id = await this.insert(tx, config, operation.values);
                created = true;
            } else {
                await this.update(tx, config, existing, operation.values);
                id = existing;
            }
        }

        const rawRowIds = await this.ensureRawRows(tx, mutation.sources);
        for (const rawRowId of rawRowIds) {
            await tx.query(sql.unsafe`
                INSERT INTO ${sql.identifier([config.sourceTable])}
                    (${sql.identifier([config.sourceKey])}, raw_row_id, group_id, last_seen_run_id)
                VALUES (${id}::uuid, ${rawRowId}::uuid, ${groupId}, ${runId}::uuid)
                ON CONFLICT (${sql.identifier([config.sourceKey])}, raw_row_id)
                DO UPDATE SET group_id = EXCLUDED.group_id,
                              last_seen_run_id = EXCLUDED.last_seen_run_id,
                              updated_at = now()
            `);
        }
        if (operation.sections.length > 0) {
            await this.writeSections(tx, id, operation.sections, rawRowIds[0]);
        }
        return { id, created };
    }

    private async update(
        tx: CommonQueryMethods,
        config: TypeConfig,
        id: string,
        values: ReadonlyMap<string, Scalar>,
    ): Promise<void> {
        const assignments = [...values].map(([name, value]) => {
            const field = config.fields[name];
            if (field === undefined) throw invalid(`Unsupported field "${name}"`);
            return sql.fragment`${sql.identifier([field.column])} = ${cast(field.type, value)}`;
        });
        assignments.push(sql.fragment`updated_at = now()`);
        const result = await tx.query(sql.unsafe`
            UPDATE ${sql.identifier([config.table])}
            SET ${sql.join(assignments, sql.fragment`, `)}
            WHERE id = ${id}::uuid
        `);
        if (result.rowCount === 0) {
            throw new ProgramsSyncError('RECORD_NOT_FOUND', `Record not found: ${id}`);
        }
    }

    private async insert(
        tx: CommonQueryMethods,
        config: TypeConfig,
        values: ReadonlyMap<string, Scalar>,
    ): Promise<string> {
        const entries = [...values];
        if (entries.length === 0) throw invalid('Create requires data');
        const columns = entries.map(([name]) => {
            const field = config.fields[name];
            if (field === undefined) throw invalid(`Unsupported field "${name}"`);
            return sql.identifier([field.column]);
        });
        const params = entries.map(([name, value]) => {
            const field = config.fields[name];
            if (field === undefined) throw invalid(`Unsupported field "${name}"`);
            return cast(field.type, value);
        });
        const row = await tx.one(sql.unsafe`
            INSERT INTO ${sql.identifier([config.table])}
                (${sql.join(columns, sql.fragment`, `)})
            VALUES (${sql.join(params, sql.fragment`, `)})
            RETURNING id::text AS id
        `);
        return idRowSchema.parse(row).id;
    }

    private async findByNaturalKey(
        tx: CommonQueryMethods,
        recordType: CatalogRecordType,
        values: ReadonlyMap<string, Scalar>,
    ): Promise<string | null> {
        const config = TYPES[recordType];
        const text = (name: string): string | undefined => {
            const value = values.get(name);
            return value === undefined || value === null ? undefined : String(value);
        };
        const filters: FragmentSqlToken[] = [];
        if (recordType === 'program') {
            const key = buildProgramMatchKey({
                organizationId: text('organizationId') ?? '',
                level: text('level') ?? '',
                ...(text('directionCode') === undefined
                    ? {}
                    : { directionCode: text('directionCode') }),
                ...(text('profile') === undefined ? {} : { profile: text('profile') }),
                ...(text('qualification') === undefined
                    ? {}
                    : { qualification: text('qualification') }),
                ...(text('title') === undefined ? {} : { title: text('title') }),
            });
            filters.push(
                sql.fragment`organization_id = ${key.organizationId}::uuid`,
                sql.fragment`level = ${key.level}`,
            );
            if (key.kind === 'coded') {
                filters.push(
                    sql.fragment`direction_code = ${key.directionCode}`,
                    sql.fragment`profile IS NOT DISTINCT FROM ${key.profile ?? null}::text`,
                    sql.fragment`qualification IS NOT DISTINCT FROM ${key.qualification ?? null}::text`,
                );
            } else {
                filters.push(
                    sql.fragment`direction_code IS NULL`,
                    sql.fragment`title = ${key.title}`,
                );
            }
        } else {
            for (const name of config.naturalKey) {
                const field = config.fields[name];
                if (field === undefined) continue;
                filters.push(
                    sql.fragment`${sql.identifier([field.column])} IS NOT DISTINCT FROM ${cast(field.type, values.get(name) ?? null)}`,
                );
            }
        }
        const row = await tx.maybeOne(sql.unsafe`
            SELECT id::text AS id
            FROM ${sql.identifier([config.table])}
            WHERE ${sql.join(filters, sql.fragment` AND `)}
        `);
        return row === null ? null : idRowSchema.parse(row).id;
    }

    /** Finds or stages `source_sheet`/`raw_row` for provenance without touching sync state. */
    private async ensureRawRows(
        tx: CommonQueryMethods,
        sources: readonly SourceReference[],
    ): Promise<string[]> {
        const result: string[] = [];
        for (const source of sources) {
            if (source.rowNumbers.length === 0) continue;
            const { spreadsheetId, sheetId } = parseSourceId(source.sourceId);
            const sheet = await tx.one(sql.unsafe`
                INSERT INTO source_sheet (spreadsheet_id, sheet_id, title)
                VALUES (${spreadsheetId}, ${sheetId}::bigint, ${source.sourceId})
                ON CONFLICT (spreadsheet_id, sheet_id)
                DO UPDATE SET spreadsheet_id = EXCLUDED.spreadsheet_id
                RETURNING id::text AS id
            `);
            const sheetUuid = idRowSchema.parse(sheet).id;
            for (const rowNo of source.rowNumbers) {
                const row = await tx.one(sql.unsafe`
                    INSERT INTO raw_row (source_sheet_id, row_no, data, row_hash)
                    VALUES (${sheetUuid}::uuid, ${rowNo}, '{}'::jsonb, '')
                    ON CONFLICT (source_sheet_id, row_no)
                    DO UPDATE SET row_no = EXCLUDED.row_no
                    RETURNING id::text AS id
                `);
                result.push(idRowSchema.parse(row).id);
            }
        }
        return result;
    }

    private async writeSections(
        tx: CommonQueryMethods,
        programId: string,
        sections: readonly { sectionType: string; text: string }[],
        sourceRowId: string | undefined,
    ): Promise<void> {
        const program = await tx.maybeOne(sql.unsafe`
            SELECT organization_id::text AS organization_id, level
            FROM program WHERE id = ${programId}::uuid
        `);
        if (program === null) {
            throw new ProgramsSyncError('RECORD_NOT_FOUND', `Record not found: ${programId}`);
        }
        const { organization_id: organizationId, level } = programRowSchema.parse(program);
        for (const section of sections) {
            const chunks = splitSectionText(section.text);
            for (const [chunkNo, text] of chunks.entries()) {
                await tx.query(sql.unsafe`
                    INSERT INTO content_chunk
                        (program_id, organization_id, level, section_type, chunk_no, text, source_row_id)
                    VALUES (${programId}::uuid, ${organizationId}::uuid, ${level},
                            ${section.sectionType}, ${chunkNo}, ${text}, ${sourceRowId ?? null}::uuid)
                    ON CONFLICT (program_id, section_type, chunk_no)
                    DO UPDATE SET text = EXCLUDED.text,
                                  source_row_id = EXCLUDED.source_row_id,
                                  updated_at = now()
                    WHERE content_chunk.text IS DISTINCT FROM EXCLUDED.text
                       OR content_chunk.source_row_id IS DISTINCT FROM EXCLUDED.source_row_id
                `);
            }
            // The section text was replaced: derived chunks past the new tail are stale.
            await tx.query(sql.unsafe`
                DELETE FROM content_chunk
                WHERE program_id = ${programId}::uuid
                  AND section_type = ${section.sectionType}
                  AND chunk_no >= ${chunks.length}
            `);
        }
    }

    private toSyncError(error: unknown): ProgramsSyncError {
        if (error instanceof ProgramsSyncError) return error;
        if (
            error instanceof IntegrityConstraintViolationError ||
            error instanceof DataIntegrityError
        ) {
            return new ProgramsSyncError('MUTATION_CONFLICT', 'Catalog rejected the mutation');
        }
        return new ProgramsSyncError('CATALOG_UNAVAILABLE', 'Catalog write failed');
    }
}
