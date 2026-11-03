import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { sheets_v4 } from 'googleapis';
import {
    createGoogleSheetsClient,
    GoogleSheetsReader,
    loadSourceSpreadsheets,
} from './google-sheets-reader';

const sources = [{ name: 'Example', spreadsheetId: 'spreadsheet-1' }];

function client(): {
    spreadsheets: {
        get: ReturnType<typeof vi.fn>;
        values: { batchGet: ReturnType<typeof vi.fn> };
    };
} {
    return {
        spreadsheets: {
            get: vi.fn(),
            values: { batchGet: vi.fn() },
        },
    };
}

describe('GoogleSheetsReader', () => {
    it('loads seven distinct configured spreadsheet IDs', () => {
        const configured = loadSourceSpreadsheets();
        expect(configured).toHaveLength(7);
        expect(new Set(configured.map(({ spreadsheetId }) => spreadsheetId)).size).toBe(7);
    });

    it('accepts a service account JSON file and rejects missing credentials', () => {
        const dir = mkdtempSync(join(tmpdir(), 'etl-sheets-'));
        const file = join(dir, 'key.json');
        try {
            writeFileSync(
                file,
                JSON.stringify({
                    type: 'service_account',
                    client_email: 'example@example.test',
                    private_key: 'fake-test-key',
                }),
            );
            expect(
                createGoogleSheetsClient({ GOOGLE_SERVICE_ACCOUNT_KEY_FILE: file }),
            ).toHaveProperty('spreadsheets.get');
            expect(() => createGoogleSheetsClient({})).toThrow('Configure exactly one');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('lists stable sheet IDs, hidden state, and merge ranges', async () => {
        const api = client();
        api.spreadsheets.get.mockResolvedValue({
            data: {
                sheets: [
                    {
                        properties: { sheetId: 42, title: "Программы '2026", hidden: false },
                        merges: [
                            {
                                startRowIndex: 0,
                                endRowIndex: 2,
                                startColumnIndex: 0,
                                endColumnIndex: 2,
                            },
                        ],
                    },
                    { properties: { sheetId: 43, title: 'Копия', hidden: true } },
                ],
            },
        });
        const reader = new GoogleSheetsReader(() => api as unknown as sheets_v4.Sheets, sources);

        expect(reader.listSources()).toEqual(sources);
        expect(await reader.listSheets('spreadsheet-1')).toEqual([
            {
                spreadsheetId: 'spreadsheet-1',
                sheetId: 42,
                title: "Программы '2026",
                hidden: false,
                merges: [
                    { startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 },
                ],
            },
            {
                spreadsheetId: 'spreadsheet-1',
                sheetId: 43,
                title: 'Копия',
                hidden: true,
                merges: [],
            },
        ]);
        expect(api.spreadsheets.get).toHaveBeenCalledWith(
            expect.objectContaining({ spreadsheetId: 'spreadsheet-1', includeGridData: false }),
        );
    });

    it('reads formatted values by stable sheet ID and preserves original row numbers', async () => {
        const api = client();
        api.spreadsheets.get.mockResolvedValue({
            data: {
                sheets: [
                    {
                        properties: { sheetId: 42, title: "Программы '2026", hidden: false },
                        merges: [
                            {
                                startRowIndex: 1,
                                endRowIndex: 3,
                                startColumnIndex: 0,
                                endColumnIndex: 1,
                            },
                        ],
                    },
                ],
            },
        });
        api.spreadsheets.values.batchGet.mockResolvedValue({
            data: {
                valueRanges: [
                    {
                        values: [
                            ['Название', 'Стоимость'],
                            ['Курс', '400 000/\n345 000\n2 г 10 мес'],
                            [],
                            ['Другая программа', '75 600 ₽'],
                        ],
                    },
                ],
            },
        });
        const reader = new GoogleSheetsReader(() => api as unknown as sheets_v4.Sheets, sources);

        const sheet = await reader.readSheet({ spreadsheetId: 'spreadsheet-1', sheetId: 42 });
        expect(sheet).toMatchObject({
            spreadsheetId: 'spreadsheet-1',
            sheetId: 42,
            title: "Программы '2026",
            headers: ['Название', 'Стоимость'],
            rows: [
                { rowNo: 2, cells: ['Курс', '400 000/\n345 000\n2 г 10 мес'] },
                { rowNo: 3, cells: [] },
                { rowNo: 4, cells: ['Другая программа', '75 600 ₽'] },
            ],
            merges: [{ startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 }],
        });
        expect(api.spreadsheets.values.batchGet).toHaveBeenCalledWith({
            spreadsheetId: 'spreadsheet-1',
            ranges: ["'Программы ''2026'"],
            valueRenderOption: 'FORMATTED_VALUE',
            majorDimension: 'ROWS',
        });
    });

    it('rejects an unknown sheet ID without reading values', async () => {
        const api = client();
        api.spreadsheets.get.mockResolvedValue({ data: { sheets: [] } });
        const reader = new GoogleSheetsReader(() => api as unknown as sheets_v4.Sheets, sources);
        await expect(
            reader.readSheet({ spreadsheetId: 'spreadsheet-1', sheetId: 999 }),
        ).rejects.toThrow('Sheet not found');
        expect(api.spreadsheets.values.batchGet).not.toHaveBeenCalled();
    });

    it('does not expose API error bodies or raw cell values in errors', async () => {
        const api = client();
        api.spreadsheets.get.mockRejectedValue({
            response: { status: 403, data: { error: { message: 'private-cell-value' } } },
            message: 'private-cell-value',
        });
        const reader = new GoogleSheetsReader(() => api as unknown as sheets_v4.Sheets, sources);
        await expect(reader.listSheets('spreadsheet-1')).rejects.toThrow(
            'Sheets API unavailable (403)',
        );
        try {
            await reader.listSheets('spreadsheet-1');
        } catch (error) {
            expect(JSON.stringify(error)).not.toContain('private-cell-value');
        }
    });

    it('sanitizes value API failures too', async () => {
        const api = client();
        api.spreadsheets.get.mockResolvedValue({
            data: { sheets: [{ properties: { sheetId: 42, title: 'Программы' } }] },
        });
        api.spreadsheets.values.batchGet.mockRejectedValue({
            response: { status: 429, data: { error: { message: 'private-cell-value' } } },
        });
        const reader = new GoogleSheetsReader(() => api as unknown as sheets_v4.Sheets, sources);
        await expect(
            reader.readSheet({ spreadsheetId: 'spreadsheet-1', sheetId: 42 }),
        ).rejects.toThrow('Sheets API unavailable (429)');
    });
});
