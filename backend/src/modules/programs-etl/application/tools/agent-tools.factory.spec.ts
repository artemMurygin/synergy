import { describe, expect, it, vi } from 'vitest';
import { ProgramsSyncError } from '../errors/programs-sync.error';
import type { CatalogRecordDetails, CatalogRecordSummary } from '../models/catalog-query';
import { createProgramsGroup } from '../models/programs-group';
import type { GroupSource } from '../models/programs-group';
import type { CatalogQueryPort, SheetsReaderPort } from '../ports/programs-etl.ports';
import { createAgentTools } from './agent-tools.factory';
import type { AgentTool, AgentToolCallLog, AgentToolset } from './agent-tools.factory';

function source(sourceId: string): GroupSource {
    return {
        sourceId,
        book: 'book',
        spreadsheetId: `sp-${sourceId}`,
        sheetId: 7,
        title: `Sheet ${sourceId}`,
        role: 'programs',
        url: `https://example.test/${sourceId}`,
    };
}

const group = createProgramsGroup({
    id: 'g1',
    name: 'Group 1',
    status: 'ready',
    note: 'sheets are linked',
    sources: [source('s1'), source('s2')],
});

const summary: CatalogRecordSummary = {
    recordType: 'program',
    recordId: 'rec-1',
    naturalKey: { title: 'Secret program title' },
    sources: [{ sourceId: 's1', rowNumbers: [3] }],
};
const details: CatalogRecordDetails = {
    recordType: 'program',
    recordId: 'rec-1',
    fields: { title: 'Secret program title' },
    sources: [{ sourceId: 's1', rowNumbers: [3] }],
};

interface SetupOverrides {
    reader?: Partial<SheetsReaderPort>;
    catalog?: Partial<CatalogQueryPort>;
}

interface Setup {
    toolset: AgentToolset;
    tool: (name: string) => AgentTool;
    catalog: CatalogQueryPort;
    logs: AgentToolCallLog[];
    metrics: ReturnType<typeof vi.fn>;
    readRange: ReturnType<typeof vi.fn>;
    searchRecords: ReturnType<typeof vi.fn>;
    getRecord: ReturnType<typeof vi.fn>;
    listSourceRecords: ReturnType<typeof vi.fn>;
}

function setup(overrides?: SetupOverrides): Setup {
    const readRange = vi.fn(() =>
        Promise.resolve({
            sourceId: 's1',
            range: 'A1:B2',
            rows: [{ rowNo: 1, cells: [{ column: 'A', value: 'CELL-SECRET' }] }],
            truncated: true,
            nextRange: 'A2:B2',
        }),
    );
    const reader: SheetsReaderPort = {
        readFingerprints: vi.fn(),
        readRange,
        ...overrides?.reader,
    };
    const searchRecords = vi.fn(() => Promise.resolve([summary]));
    const getRecord = vi.fn(() => Promise.resolve<CatalogRecordDetails | null>(details));
    const listSourceRecords = vi.fn(() => Promise.resolve([summary]));
    const catalog: CatalogQueryPort = {
        searchRecords,
        getRecord,
        listSourceRecords,
        ...overrides?.catalog,
    };
    const logs: AgentToolCallLog[] = [];
    const metrics = vi.fn();
    const toolset = createAgentTools({
        runId: 'run-1',
        group,
        sheetsReader: reader,
        catalogQuery: catalog,
        logger: { log: (entry) => logs.push(entry) },
        metrics: { recordToolCall: metrics },
    });
    const tool = (name: string): AgentTool => {
        const found = toolset.tools.find((t) => t.name === name);
        if (!found) throw new Error(`no tool ${name}`);
        return found;
    };
    return {
        toolset,
        tool,
        catalog,
        logs,
        metrics,
        readRange,
        searchRecords,
        getRecord,
        listSourceRecords,
    };
}

describe('createAgentTools', () => {
    it('exposes exactly the five read-only tools', () => {
        const { toolset } = setup();
        expect(toolset.tools.map((t) => t.name)).toEqual([
            'list_group_sources',
            'read_sheet_range',
            'search_catalog_records',
            'get_catalog_record',
            'list_source_records',
        ]);
    });

    it('list_group_sources returns group metadata and sources in order', async () => {
        const { tool } = setup();
        const out = await tool('list_group_sources').execute({});
        expect(out).toEqual({
            group: { id: 'g1', name: 'Group 1', status: 'ready', note: 'sheets are linked' },
            sources: [
                {
                    source_id: 's1',
                    spreadsheet_id: 'sp-s1',
                    sheet_id: 7,
                    title: 'Sheet s1',
                    role: 'programs',
                    url: 'https://example.test/s1',
                },
                {
                    source_id: 's2',
                    spreadsheet_id: 'sp-s2',
                    sheet_id: 7,
                    title: 'Sheet s2',
                    role: 'programs',
                    url: 'https://example.test/s2',
                },
            ],
        });
    });

    it('list_group_sources fails with GROUP_NOT_AVAILABLE when the group has no sources', async () => {
        const empty = createProgramsGroup({ id: 'g2', name: 'x', status: 'ready', sources: [] });
        const toolset = createAgentTools({
            runId: 'r',
            group: empty,
            sheetsReader: { readFingerprints: vi.fn(), readRange: vi.fn() },
            catalogQuery: setup().catalog,
            logger: { log: vi.fn() },
        });
        await expect(toolset.tools[0]?.execute({})).rejects.toMatchObject({
            code: 'GROUP_NOT_AVAILABLE',
        });
    });

    it('read_sheet_range reads a group source and maps the output contract', async () => {
        const { tool, readRange } = setup();
        const out = await tool('read_sheet_range').execute({ source_id: 's1', range: 'A1:B2' });
        expect(readRange).toHaveBeenCalledWith({ source: source('s1'), range: 'A1:B2' });
        expect(out).toEqual({
            source: {
                source_id: 's1',
                spreadsheet_id: 'sp-s1',
                sheet_id: 7,
                title: 'Sheet s1',
            },
            requested_range: 'A1:B2',
            returned_range: 'A1:B2',
            rows: [{ row_no: 1, cells: [{ column: 'A', value: 'CELL-SECRET' }] }],
            truncated: true,
            next_range: 'A2:B2',
        });
    });

    it('read_sheet_range rejects a foreign source_id without touching the reader', async () => {
        const { tool, readRange } = setup();
        await expect(
            tool('read_sheet_range').execute({ source_id: 'foreign', range: 'A1:B2' }),
        ).rejects.toMatchObject({ code: 'SOURCE_NOT_IN_GROUP' });
        expect(readRange).not.toHaveBeenCalled();
    });

    it.each(['A:Z', 'A1:Z', 'A1', 'Sheet1!A1:B2', '', 'A1:B2000000000'])(
        'read_sheet_range rejects unbounded range %j',
        async (range) => {
            const { tool, readRange } = setup();
            await expect(
                tool('read_sheet_range').execute({ source_id: 's1', range }),
            ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
            expect(readRange).not.toHaveBeenCalled();
        },
    );

    it('read_sheet_range rejects malformed input as INVALID_RANGE', async () => {
        const { tool } = setup();
        await expect(tool('read_sheet_range').execute({ source_id: 's1' })).rejects.toMatchObject({
            code: 'INVALID_RANGE',
        });
    });

    it.each(['SOURCE_UNAVAILABLE', 'RATE_LIMITED', 'TIMEOUT'] as const)(
        'read_sheet_range propagates %s from the reader',
        async (code) => {
            const { tool } = setup({
                reader: { readRange: () => Promise.reject(new ProgramsSyncError(code, 'boom')) },
            });
            await expect(
                tool('read_sheet_range').execute({ source_id: 's1', range: 'A1:B2' }),
            ).rejects.toMatchObject({ code });
        },
    );

    it('search_catalog_records maps criteria and returns candidates', async () => {
        const { tool, searchRecords } = setup();
        const out = await tool('search_catalog_records').execute({
            record_type: 'program',
            criteria: { title: 'X' },
            limit: 5,
        });
        expect(searchRecords).toHaveBeenCalledWith({
            recordType: 'program',
            criteria: { title: 'X' },
            limit: 5,
        });
        expect(out).toEqual({
            candidates: [
                {
                    record_id: 'rec-1',
                    record_type: 'program',
                    natural_key: { title: 'Secret program title' },
                    sources: [{ source_id: 's1', row_numbers: [3] }],
                },
            ],
        });
    });

    it.each([
        {},
        { record_type: 'nope', criteria: { a: 1 } },
        { record_type: 'program' },
        { record_type: 'program', criteria: {} },
        { record_type: 'program', criteria: { a: { nested: 1 } } },
        { record_type: 'program', criteria: { a: 1 }, limit: 0 },
    ])('search_catalog_records rejects invalid input %j', async (input) => {
        const { tool, searchRecords } = setup();
        await expect(tool('search_catalog_records').execute(input)).rejects.toMatchObject({
            code: 'INVALID_QUERY',
        });
        expect(searchRecords).not.toHaveBeenCalled();
    });

    it('search_catalog_records rejects source_id criterion outside the group', async () => {
        const { tool } = setup();
        await expect(
            tool('search_catalog_records').execute({
                record_type: 'program',
                criteria: { source_id: 'foreign' },
            }),
        ).rejects.toMatchObject({ code: 'SOURCE_NOT_IN_GROUP' });
    });

    it('get_catalog_record returns details and passes section', async () => {
        const { tool, getRecord } = setup();
        const out = await tool('get_catalog_record').execute({
            record_type: 'program',
            record_id: 'rec-1',
            section: 'about',
        });
        expect(getRecord).toHaveBeenCalledWith({
            recordType: 'program',
            recordId: 'rec-1',
            section: 'about',
        });
        expect(out).toEqual({
            record_id: 'rec-1',
            record_type: 'program',
            fields: { title: 'Secret program title' },
            sources: [{ source_id: 's1', row_numbers: [3] }],
        });
    });

    it('get_catalog_record fails with RECORD_NOT_FOUND when the record is gone', async () => {
        const { tool } = setup({ catalog: { getRecord: () => Promise.resolve(null) } });
        await expect(
            tool('get_catalog_record').execute({ record_type: 'program', record_id: 'x' }),
        ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    });

    it('get_catalog_record rejects invalid input', async () => {
        const { tool } = setup();
        await expect(
            tool('get_catalog_record').execute({ record_type: 'program' }),
        ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    });

    it('list_source_records scopes by group source and maps output', async () => {
        const { tool, listSourceRecords } = setup();
        const out = await tool('list_source_records').execute({ source_id: 's1', row_no: 3 });
        expect(listSourceRecords).toHaveBeenCalledWith({ sourceId: 's1', rowNo: 3 });
        expect(out).toMatchObject({ records: [{ record_id: 'rec-1' }] });
    });

    it('list_source_records rejects a foreign source_id', async () => {
        const { tool, listSourceRecords } = setup();
        await expect(
            tool('list_source_records').execute({ source_id: 'foreign' }),
        ).rejects.toMatchObject({ code: 'SOURCE_NOT_IN_GROUP' });
        expect(listSourceRecords).not.toHaveBeenCalled();
    });

    it('propagates CATALOG_UNAVAILABLE', async () => {
        const { tool } = setup({
            catalog: {
                searchRecords: () =>
                    Promise.reject(new ProgramsSyncError('CATALOG_UNAVAILABLE', 'db down')),
            },
        });
        await expect(
            tool('search_catalog_records').execute({
                record_type: 'program',
                criteria: { title: 'X' },
            }),
        ).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
    });

    describe('recordId provenance within the run', () => {
        it('only records returned by catalog tools are known', async () => {
            const { tool, toolset } = setup();
            expect(toolset.isKnownRecord({ recordType: 'program', recordId: 'rec-1' })).toBe(false);
            await tool('search_catalog_records').execute({
                record_type: 'program',
                criteria: { title: 'X' },
            });
            expect(toolset.isKnownRecord({ recordType: 'program', recordId: 'rec-1' })).toBe(true);
            expect(toolset.isKnownRecord({ recordType: 'program', recordId: 'invented' })).toBe(
                false,
            );
            expect(toolset.isKnownRecord({ recordType: 'offer', recordId: 'rec-1' })).toBe(false);
        });

        it('get_catalog_record and list_source_records also register records', async () => {
            const { tool, toolset } = setup();
            await tool('list_source_records').execute({ source_id: 's1' });
            expect(toolset.isKnownRecord({ recordType: 'program', recordId: 'rec-1' })).toBe(true);
            const second = setup();
            await second.tool('get_catalog_record').execute({
                record_type: 'program',
                record_id: 'rec-1',
            });
            expect(second.toolset.isKnownRecord({ recordType: 'program', recordId: 'rec-1' })).toBe(
                true,
            );
        });

        it('a model-supplied record_id that the catalog did not return is not registered', async () => {
            const { tool, toolset } = setup({
                catalog: { getRecord: () => Promise.resolve(null) },
            });
            await expect(
                tool('get_catalog_record').execute({ record_type: 'program', record_id: 'guess' }),
            ).rejects.toBeInstanceOf(ProgramsSyncError);
            expect(toolset.isKnownRecord({ recordType: 'program', recordId: 'guess' })).toBe(false);
        });

        it('known records are not shared between toolsets of different runs', async () => {
            const a = setup();
            const b = setup();
            await a.tool('list_source_records').execute({ source_id: 's1' });
            expect(b.toolset.isKnownRecord({ recordType: 'program', recordId: 'rec-1' })).toBe(
                false,
            );
        });
    });

    describe('observability', () => {
        it('logs metadata without cell values, prompts or record contents', async () => {
            const { tool, logs, metrics } = setup();
            await tool('read_sheet_range').execute({ source_id: 's1', range: 'A1:B2' });
            await tool('get_catalog_record').execute({
                record_type: 'program',
                record_id: 'rec-1',
            });
            expect(logs).toHaveLength(2);
            expect(logs[0]).toMatchObject({
                groupId: 'g1',
                runId: 'run-1',
                toolName: 'read_sheet_range',
                sourceId: 's1',
                range: 'A1:B2',
                rowCount: 1,
                outcome: 'success',
            });
            expect(typeof logs[0]?.durationMs).toBe('number');
            expect(logs[1]).toMatchObject({
                toolName: 'get_catalog_record',
                recordType: 'program',
                recordId: 'rec-1',
                outcome: 'success',
            });
            const serialized = JSON.stringify(logs);
            expect(serialized).not.toContain('CELL-SECRET');
            expect(serialized).not.toContain('Secret program title');
            expect(metrics).toHaveBeenCalledWith({
                tool: 'read_sheet_range',
                outcome: 'success',
                durationSeconds: expect.any(Number) as number,
            });
        });

        it('logs failures with the error code and records a failure metric', async () => {
            const { tool, logs, metrics } = setup();
            await expect(
                tool('read_sheet_range').execute({ source_id: 'foreign', range: 'A1:B2' }),
            ).rejects.toBeInstanceOf(ProgramsSyncError);
            expect(logs[0]).toMatchObject({ outcome: 'failure', errorCode: 'SOURCE_NOT_IN_GROUP' });
            expect(metrics).toHaveBeenCalledWith({
                tool: 'read_sheet_range',
                outcome: 'failure',
                durationSeconds: expect.any(Number) as number,
            });
        });

        it('logs candidate count for catalog searches', async () => {
            const { tool, logs } = setup();
            await tool('search_catalog_records').execute({
                record_type: 'program',
                criteria: { title: 'X' },
            });
            expect(logs[0]).toMatchObject({ recordType: 'program', candidateCount: 1 });
        });
    });

    it('offers no write or SQL tools and tool inputs have no group/SQL fields', () => {
        const { toolset } = setup();
        for (const t of toolset.tools) {
            expect(t.name).not.toMatch(/write|apply|update|delete|create|sql|query/i);
            expect(Object.keys(t.inputSchema.properties)).not.toEqual(
                expect.arrayContaining(['group_id']),
            );
            expect(Object.keys(t.inputSchema.properties)).not.toEqual(
                expect.arrayContaining(['sql']),
            );
        }
    });
});
