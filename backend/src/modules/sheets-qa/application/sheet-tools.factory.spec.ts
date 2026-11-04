import { describe, expect, it, vi } from 'vitest';
import { BookRegistry } from './book-registry';
import type { SheetGuidesPort } from '../domain/ports/sheet-guides.port';
import { WorkbookError, type WorkbookReaderPort } from '../domain/ports/workbook-reader.port';
import { createSheetTools } from './sheet-tools.factory';

function setup(
    reader: Partial<WorkbookReaderPort>,
    maxAnswerChars = 1000,
    guides: Partial<SheetGuidesPort> = {},
): ReturnType<typeof createSheetTools> {
    const library = new BookRegistry(
        [
            {
                id: 'ЦП',
                description: 'main',
                reader: reader as WorkbookReaderPort,
                guides: guides as SheetGuidesPort,
            },
        ],
        'ЦП',
    );
    return createSheetTools(library, { maxAnswerChars });
}

async function call(
    tools: ReturnType<typeof createSheetTools>,
    name: string,
    input: unknown,
): Promise<string> {
    const found = tools.find((t) => t.name === name) as
        { invoke: (input: unknown) => Promise<unknown> } | undefined;
    if (found === undefined) throw new Error(`no tool ${name}`);
    return String(await found.invoke(input));
}

describe('createSheetTools', () => {
    it('exposes the seven read-only tools', () => {
        const tools = setup({});
        expect(tools.map((t) => t.name).sort()).toEqual([
            'find_related',
            'get_row_links',
            'list_books',
            'list_sheets',
            'read_rows',
            'read_sheet_guide',
            'search_cells',
        ]);
    });

    it('passes arguments to the reader and returns JSON', async () => {
        const readRows = vi
            .fn()
            .mockResolvedValue({ columnLabels: {}, rows: [], truncated: false });
        const tools = setup({ readRows });
        const out = await call(tools, 'read_rows', {
            sheet: 'СПО',
            from_row: 7,
            to_row: 9,
            columns: ['C'],
        });
        expect(readRows).toHaveBeenCalledWith('СПО', 7, 9, ['C']);
        expect(JSON.parse(out)).toEqual({ columnLabels: {}, rows: [], truncated: false });
    });

    it('turns a WorkbookError into an error answer the model can act on', async () => {
        const tools = setup({
            searchCells: vi.fn().mockRejectedValue(new WorkbookError('Unknown sheet "x"')),
        });
        const out = await call(tools, 'search_cells', { queries: ['x'] });
        expect(JSON.parse(out)).toEqual({ error: 'Unknown sheet "x"' });
    });

    it('asks to narrow the request instead of returning an oversized answer', async () => {
        const tools = setup({ readRows: vi.fn().mockResolvedValue({ big: 'я'.repeat(2000) }) });
        const out = await call(tools, 'read_rows', {
            sheet: 'СПО',
            from_row: 1,
            to_row: 2,
        });
        expect(out).toContain('too large');
    });

    it('does not swallow unexpected failures', async () => {
        const tools = setup({ listSheets: vi.fn().mockRejectedValue(new Error('boom')) });
        await expect(call(tools, 'list_sheets', {})).rejects.toThrow('boom');
    });

    it('returns the workbook structure without arguments and a guide with a sheet name', async () => {
        const index = vi.fn().mockResolvedValue('оглавление');
        const guide = vi.fn().mockResolvedValue('описание СПО');
        const tools = setup({}, 1000, { index, guide });
        expect(JSON.parse(await call(tools, 'read_sheet_guide', {}))).toBe('оглавление');
        expect(JSON.parse(await call(tools, 'read_sheet_guide', { sheet: 'СПО' }))).toBe(
            'описание СПО',
        );
        expect(guide).toHaveBeenCalledWith('СПО');
    });

    it('turns an unknown guide into an error the model can act on', async () => {
        const guide = vi.fn().mockRejectedValue(new WorkbookError('No guide for sheet "x"'));
        const tools = setup({}, 1000, { guide });
        expect(JSON.parse(await call(tools, 'read_sheet_guide', { sheet: 'x' }))).toEqual({
            error: 'No guide for sheet "x"',
        });
    });

    it('lists the books with their descriptions', async () => {
        const tools = setup({});
        expect(JSON.parse(await call(tools, 'list_books', {}))).toEqual([
            { id: 'ЦП', description: 'main' },
        ]);
    });

    it('routes every tool to the book named in the book argument', async () => {
        const mainSearch = vi.fn().mockResolvedValue({ hits: [], truncated: false });
        const otherSearch = vi.fn().mockResolvedValue({ hits: [], truncated: false });
        const otherIndex = vi.fn().mockResolvedValue('индекс другой книги');
        const library = new BookRegistry(
            [
                {
                    id: 'ЦП',
                    description: 'main',
                    reader: { searchCells: mainSearch } as unknown as WorkbookReaderPort,
                    guides: {} as SheetGuidesPort,
                },
                {
                    id: 'Другая',
                    description: 'other',
                    reader: { searchCells: otherSearch } as unknown as WorkbookReaderPort,
                    guides: { index: otherIndex } as unknown as SheetGuidesPort,
                },
            ],
            'ЦП',
        );
        const tools = createSheetTools(library, { maxAnswerChars: 1000 });
        await call(tools, 'search_cells', { queries: ['a'] });
        await call(tools, 'search_cells', { queries: ['b'], book: 'Другая' });
        expect(mainSearch).toHaveBeenCalledWith(['a'], undefined);
        expect(otherSearch).toHaveBeenCalledWith(['b'], undefined);
        expect(JSON.parse(await call(tools, 'read_sheet_guide', { book: 'Другая' }))).toBe(
            'индекс другой книги',
        );
    });

    it('tells the model the available books when the book is unknown', async () => {
        const tools = setup({ listSheets: vi.fn() });
        const out = JSON.parse(await call(tools, 'list_sheets', { book: 'нет' })) as {
            error: string;
        };
        expect(out.error).toContain('Unknown book "нет"');
        expect(out.error).toContain('ЦП');
    });
});
