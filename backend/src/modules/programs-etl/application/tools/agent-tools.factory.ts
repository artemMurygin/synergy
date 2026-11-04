import { ProgramsSyncError } from '../errors/programs-sync.error';
import { CATALOG_RECORD_TYPES } from '../models/catalog-mutation';
import type { CatalogRecordRef, CatalogRecordType } from '../models/catalog-mutation';
import type { CatalogSearchQuery } from '../models/catalog-query';
import type { GroupSource, ProgramsGroup } from '../models/programs-group';
import type { SourceReference } from '../models/source-fingerprint';
import type {
    CatalogQueryPort,
    ProgramsSyncMetricsPort,
    SheetsReaderPort,
} from '../ports/programs-etl.ports';

/** Structured log entry of one tool call: metadata only, never cell values or record bodies. */
export interface AgentToolCallLog {
    readonly groupId: string;
    readonly runId: string;
    readonly toolName: string;
    readonly durationMs: number;
    readonly outcome: 'success' | 'failure';
    readonly errorCode?: string;
    readonly sourceId?: string;
    readonly range?: string;
    readonly rowCount?: number;
    readonly recordType?: string;
    readonly recordId?: string;
    readonly candidateCount?: number;
}

export interface AgentToolLogger {
    log(entry: AgentToolCallLog): void;
}

export interface AgentToolJsonSchema {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required: readonly string[];
}

/** Framework-neutral tool: the agent adapter wraps it into its SDK tool type. */
export interface AgentTool {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: AgentToolJsonSchema;
    readonly execute: (input: unknown) => Promise<unknown>;
}

export interface AgentToolset {
    readonly tools: readonly AgentTool[];
    /** True only for records returned by catalog tools of this toolset (this run). */
    readonly isKnownRecord: (ref: CatalogRecordRef) => boolean;
}

export interface CreateAgentToolsInput {
    readonly runId: string;
    readonly group: ProgramsGroup;
    readonly sheetsReader: SheetsReaderPort;
    readonly catalogQuery: CatalogQueryPort;
    readonly logger: AgentToolLogger;
    readonly metrics?: Pick<ProgramsSyncMetricsPort, 'recordToolCall'>;
}

interface LogExtras {
    sourceId?: string;
    range?: string;
    rowCount?: number;
    recordType?: string;
    recordId?: string;
    candidateCount?: number;
}

const BOUNDED_A1 = /^[A-Z]{1,3}[1-9]\d{0,6}:[A-Z]{1,3}[1-9]\d{0,6}$/;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;

function asRecord(input: unknown): Record<string, unknown> {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
}

function isRecordType(value: unknown): value is CatalogRecordType {
    return CATALOG_RECORD_TYPES.some((type) => type === value);
}

function mapSources(sources: readonly SourceReference[]): MappedSource[] {
    return sources.map((s) => ({
        source_id: s.sourceId,
        row_numbers: [...s.rowNumbers],
        ...(s.ranges === undefined ? {} : { ranges: [...s.ranges] }),
    }));
}

interface MappedSource {
    source_id: string;
    row_numbers: number[];
    ranges?: string[];
}

interface MappedSummary {
    record_id: string;
    record_type: string;
    natural_key: Readonly<Record<string, string | number | null>>;
    sources: MappedSource[];
}

function recordKey(ref: CatalogRecordRef): string {
    return `${ref.recordType}:${ref.recordId}`;
}

export function createAgentTools(input: CreateAgentToolsInput): AgentToolset {
    const { runId, group, sheetsReader, catalogQuery, logger, metrics } = input;
    const sourcesById = new Map<string, GroupSource>(group.sources.map((s) => [s.sourceId, s]));
    const knownRecords = new Set<string>();

    const requireSource = (sourceId: unknown): GroupSource => {
        const found = typeof sourceId === 'string' ? sourcesById.get(sourceId) : undefined;
        if (found === undefined) {
            throw new ProgramsSyncError(
                'SOURCE_NOT_IN_GROUP',
                'source_id does not belong to the current group',
            );
        }
        return found;
    };

    const invalidQuery = (message: string): ProgramsSyncError =>
        new ProgramsSyncError('INVALID_QUERY', message);

    const register = (refs: readonly CatalogRecordRef[]): void => {
        for (const ref of refs) knownRecords.add(recordKey(ref));
    };

    /** Wraps a handler with metadata logging and metrics; the handler fills `extras`. */
    const instrument = (
        toolName: string,
        handler: (extras: LogExtras) => Promise<unknown>,
        initial: (raw: unknown) => LogExtras = () => ({}),
    ) => {
        return async (raw: unknown): Promise<unknown> => {
            const started = Date.now();
            const extras: LogExtras = { ...initial(raw) };
            const emit = (outcome: 'success' | 'failure', errorCode?: string): void => {
                logger.log({
                    groupId: group.id,
                    runId,
                    toolName,
                    durationMs: Date.now() - started,
                    outcome,
                    ...(errorCode === undefined ? {} : { errorCode }),
                    ...extras,
                });
                metrics?.recordToolCall({
                    tool: toolName,
                    outcome,
                    durationSeconds: (Date.now() - started) / 1000,
                });
            };
            try {
                const result = await handler(extras);
                emit('success');
                return result;
            } catch (error) {
                emit('failure', error instanceof ProgramsSyncError ? error.code : 'UNKNOWN');
                throw error;
            }
        };
    };

    const sourceIdOf = (raw: unknown): LogExtras => {
        const sourceId = asRecord(raw).source_id;
        return typeof sourceId === 'string' ? { sourceId } : {};
    };

    const listGroupSources: AgentTool = {
        name: 'list_group_sources',
        description:
            'List the current group (id, name, note, organizations that own its programs) and its sheets (source_id, title, role, url). Reads no Google API.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        execute: instrument('list_group_sources', () => {
            if (group.sources.length === 0) {
                return Promise.reject(
                    new ProgramsSyncError('GROUP_NOT_AVAILABLE', 'Group has no loaded sources'),
                );
            }
            return Promise.resolve({
                group: {
                    id: group.id,
                    name: group.name,
                    status: group.status,
                    ...(group.note === undefined ? {} : { note: group.note }),
                    ...(group.organizations === undefined
                        ? {}
                        : {
                              organizations: group.organizations.map((o) => ({
                                  kind: o.kind,
                                  name: o.name,
                                  ...(o.parentName === undefined
                                      ? {}
                                      : { parent_name: o.parentName }),
                                  ...(o.hint === undefined ? {} : { hint: o.hint }),
                              })),
                          }),
                },
                sources: group.sources.map((s) => ({
                    source_id: s.sourceId,
                    spreadsheet_id: s.spreadsheetId,
                    sheet_id: s.sheetId,
                    title: s.title,
                    ...(s.role === undefined ? {} : { role: s.role }),
                    url: s.url,
                })),
            });
        }),
    };

    const readSheetRange: AgentTool = {
        name: 'read_sheet_range',
        description:
            'Read one bounded A1 range (for example A1:Z200, explicit rows required) of a group sheet.',
        inputSchema: {
            type: 'object',
            properties: {
                source_id: { type: 'string' },
                range: { type: 'string', description: 'Bounded A1 range without sheet name' },
            },
            required: ['source_id', 'range'],
        },
        execute: (raw) => {
            const args = asRecord(raw);
            const range = args.range;
            const run = instrument(
                'read_sheet_range',
                async (extras) => {
                    const source = requireSource(args.source_id);
                    if (typeof range !== 'string' || !BOUNDED_A1.test(range)) {
                        throw new ProgramsSyncError(
                            'INVALID_RANGE',
                            'range must be a bounded A1 range like A1:Z200',
                        );
                    }
                    extras.range = range;
                    const result = await sheetsReader.readRange({ source, range });
                    extras.rowCount = result.rows.length;
                    return {
                        source: {
                            source_id: source.sourceId,
                            spreadsheet_id: source.spreadsheetId,
                            sheet_id: source.sheetId,
                            title: source.title,
                        },
                        requested_range: range,
                        returned_range: result.range,
                        rows: result.rows.map((row) => ({
                            row_no: row.rowNo,
                            cells: row.cells.map((c) => ({ column: c.column, value: c.value })),
                        })),
                        truncated: result.truncated,
                        ...(result.nextRange === undefined ? {} : { next_range: result.nextRange }),
                    };
                },
                sourceIdOf,
            );
            return run(raw);
        },
    };

    const searchCatalog: AgentTool = {
        name: 'search_catalog_records',
        description:
            'Search current catalog records of one type by natural-key criteria; returns a few candidates.',
        inputSchema: {
            type: 'object',
            properties: {
                record_type: { type: 'string', enum: [...CATALOG_RECORD_TYPES] },
                criteria: { type: 'object' },
                limit: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_LIMIT },
            },
            required: ['record_type', 'criteria'],
        },
        execute: (raw) => {
            const args = asRecord(raw);
            return instrument('search_catalog_records', async (extras) => {
                const recordType = args.record_type;
                if (!isRecordType(recordType)) throw invalidQuery('Unknown record_type');
                extras.recordType = recordType;
                const rawCriteria = args.criteria;
                const criteriaObject = asRecord(rawCriteria);
                const entries = Object.entries(criteriaObject);
                if (entries.length === 0) throw invalidQuery('criteria must not be empty');
                const criteria: Record<string, string | number | boolean> = {};
                for (const [key, value] of entries) {
                    if (
                        typeof value !== 'string' &&
                        typeof value !== 'number' &&
                        typeof value !== 'boolean'
                    ) {
                        throw invalidQuery(`criteria.${key} must be a string, number or boolean`);
                    }
                    criteria[key] = value;
                }
                if ('source_id' in criteria) requireSource(criteria.source_id);
                const limit = args.limit;
                if (
                    limit !== undefined &&
                    (typeof limit !== 'number' ||
                        !Number.isInteger(limit) ||
                        limit < 1 ||
                        limit > MAX_SEARCH_LIMIT)
                ) {
                    throw invalidQuery(`limit must be an integer 1..${String(MAX_SEARCH_LIMIT)}`);
                }
                const query: CatalogSearchQuery = {
                    recordType,
                    criteria,
                    limit: limit ?? DEFAULT_SEARCH_LIMIT,
                };
                const found = await catalogQuery.searchRecords(
                    limit === undefined ? { recordType, criteria } : query,
                );
                register(found);
                extras.candidateCount = found.length;
                return { candidates: found.map(mapSummary) };
            })(raw);
        },
    };

    const getCatalogRecord: AgentTool = {
        name: 'get_catalog_record',
        description:
            'Load one catalog record found earlier by record_type and record_id; section returns full text of that section.',
        inputSchema: {
            type: 'object',
            properties: {
                record_type: { type: 'string', enum: [...CATALOG_RECORD_TYPES] },
                record_id: { type: 'string' },
                section: { type: 'string' },
            },
            required: ['record_type', 'record_id'],
        },
        execute: (raw) => {
            const args = asRecord(raw);
            return instrument('get_catalog_record', async (extras) => {
                const recordType = args.record_type;
                const recordId = args.record_id;
                const section = args.section;
                if (!isRecordType(recordType)) throw invalidQuery('Unknown record_type');
                if (typeof recordId !== 'string' || recordId.length === 0) {
                    throw invalidQuery('record_id must be a non-empty string');
                }
                if (section !== undefined && typeof section !== 'string') {
                    throw invalidQuery('section must be a string');
                }
                extras.recordType = recordType;
                extras.recordId = recordId;
                const record = await catalogQuery.getRecord(
                    section === undefined
                        ? { recordType, recordId }
                        : { recordType, recordId, section },
                );
                if (record === null) {
                    throw new ProgramsSyncError('RECORD_NOT_FOUND', 'Catalog record not found');
                }
                register([record]);
                return {
                    record_id: record.recordId,
                    record_type: record.recordType,
                    fields: record.fields,
                    sources: mapSources(record.sources),
                    ...(record.sectionText === undefined
                        ? {}
                        : { section_text: record.sectionText }),
                };
            })(raw);
        },
    };

    const listSourceRecords: AgentTool = {
        name: 'list_source_records',
        description:
            'List catalog records previously linked to a group source or to one source row.',
        inputSchema: {
            type: 'object',
            properties: { source_id: { type: 'string' }, row_no: { type: 'integer', minimum: 1 } },
            required: ['source_id'],
        },
        execute: (raw) => {
            const args = asRecord(raw);
            return instrument(
                'list_source_records',
                async (extras) => {
                    const source = requireSource(args.source_id);
                    const rowNo = args.row_no;
                    if (
                        rowNo !== undefined &&
                        (typeof rowNo !== 'number' || !Number.isInteger(rowNo) || rowNo < 1)
                    ) {
                        throw invalidQuery('row_no must be a positive integer');
                    }
                    const found = await catalogQuery.listSourceRecords(
                        rowNo === undefined
                            ? { sourceId: source.sourceId }
                            : { sourceId: source.sourceId, rowNo },
                    );
                    register(found);
                    extras.candidateCount = found.length;
                    return { records: found.map(mapSummary) };
                },
                sourceIdOf,
            )(raw);
        },
    };

    return {
        tools: [
            listGroupSources,
            readSheetRange,
            searchCatalog,
            getCatalogRecord,
            listSourceRecords,
        ],
        isKnownRecord: (ref) => knownRecords.has(recordKey(ref)),
    };
}

function mapSummary(record: {
    recordId: string;
    recordType: string;
    naturalKey: Readonly<Record<string, string | number | null>>;
    sources: readonly SourceReference[];
}): MappedSummary {
    return {
        record_id: record.recordId,
        record_type: record.recordType,
        natural_key: record.naturalKey,
        sources: mapSources(record.sources),
    };
}
