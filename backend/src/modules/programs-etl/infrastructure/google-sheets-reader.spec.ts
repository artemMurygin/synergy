import { describe, expect, it, vi } from 'vitest';
import type { sheets_v4 } from 'googleapis';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type { GroupSource } from '../application/models/programs-group';
import { GoogleSheetsReader } from './google-sheets-reader';

const source = (spreadsheetId: string, sheetId: number, title: string): GroupSource => ({
    sourceId: `${spreadsheetId}:${String(sheetId)}`,
    book: 'book',
    spreadsheetId,
    sheetId,
    title,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${String(sheetId)}`,
});

function fakeApi(): {
    api: sheets_v4.Sheets;
    get: ReturnType<typeof vi.fn>;
    batchGet: ReturnType<typeof vi.fn>;
} {
    const get = vi.fn();
    const batchGet = vi.fn();
    const api = { spreadsheets: { get, values: { batchGet } } } as unknown as sheets_v4.Sheets;
    return { api, get, batchGet };
}

const metadata = (...sheets: [number, string][]): unknown => ({
    data: { sheets: sheets.map(([sheetId, title]) => ({ properties: { sheetId, title } })) },
});

const values = (...ranges: (string | number)[][][]): unknown => ({
    data: { valueRanges: ranges.map((v) => ({ values: v })) },
});

const httpError = (status: number): Error =>
    Object.assign(new Error('boom'), { response: { status } });

const make = (
    api: sheets_v4.Sheets,
    options: Partial<{ maxCells: number; maxAttempts: number }> = {},
): GoogleSheetsReader =>
    new GoogleSheetsReader(api, {
        maxCells: options.maxCells ?? 100,
        maxAttempts: options.maxAttempts ?? 3,
        sleep: () => Promise.resolve(),
    });

async function codeOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        if (error instanceof ProgramsSyncError) return error.code;
        throw error;
    }
    throw new Error('expected rejection');
}

describe('GoogleSheetsReader.readFingerprints', () => {
    it('reads all sheets of one spreadsheet with a single batch request', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One'], [2, "It's"]));
        batchGet.mockResolvedValue(values([['a']], [['b']]));

        const result = await make(api).readFingerprints([
            source('ss', 1, 'One'),
            source('ss', 2, "It's"),
        ]);

        expect(get).toHaveBeenCalledTimes(1);
        expect(batchGet).toHaveBeenCalledTimes(1);
        expect(batchGet.mock.calls[0]?.[0]).toMatchObject({
            spreadsheetId: 'ss',
            ranges: ["'One'", "'It''s'"],
            valueRenderOption: 'FORMATTED_VALUE',
        });
        expect([...result.keys()]).toEqual(['ss:1', 'ss:2']);
        expect(result.get('ss:1')?.value).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces a stable hash that depends on values and coordinates', async () => {
        const hashOf = async (rows: string[][]): Promise<string | undefined> => {
            const { api, get, batchGet } = fakeApi();
            get.mockResolvedValue(metadata([1, 'One']));
            batchGet.mockResolvedValue(values(rows));
            const map = await make(api).readFingerprints([source('ss', 1, 'One')]);
            return map.get('ss:1')?.value;
        };
        const base = await hashOf([['a', 'b'], ['c']]);
        expect(await hashOf([['a', 'b'], ['c']])).toBe(base);
        expect(await hashOf([['a', 'x'], ['c']])).not.toBe(base);
        expect(
            await hashOf([
                ['a', 'b'],
                ['', 'c'],
            ]),
        ).not.toBe(base);
        // Trailing empty cells do not change the fingerprint.
        expect(await hashOf([['a', 'b', ''], ['c']])).toBe(base);
    });

    it('does not mix up hashes of different sheets in one batch', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One'], [2, 'Two']));
        batchGet.mockResolvedValue(values([['a']], [['b']]));
        const result = await make(api).readFingerprints([
            source('ss', 1, 'One'),
            source('ss', 2, 'Two'),
        ]);
        expect(result.get('ss:1')?.value).not.toBe(result.get('ss:2')?.value);
    });

    it('fails with the source id when the sheet is missing from the spreadsheet', async () => {
        const { api, get } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One']));
        const promise = make(api).readFingerprints([source('ss', 9, 'Gone')]);
        expect(await codeOf(promise)).toBe('SOURCE_UNAVAILABLE');
        await expect(make(api).readFingerprints([source('ss', 9, 'Gone')])).rejects.toThrow('ss:9');
    });

    it('still reads healthy sheets when one sheet is missing or one spreadsheet fails', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockImplementation(((params: { spreadsheetId: string }) =>
            params.spreadsheetId === 'bad'
                ? Promise.reject(Object.assign(new Error('x'), { code: 403 }))
                : Promise.resolve(metadata([1, 'One']))) as never);
        batchGet.mockResolvedValue(values([['a']]));
        const result = await make(api).readFingerprints([
            source('ok', 1, 'One'),
            source('ok', 9, 'Gone'),
            source('bad', 1, 'One'),
        ]);
        expect([...result.keys()]).toEqual(['ok:1']);
    });
});

describe('GoogleSheetsReader.readRange', () => {
    it('reads a bounded range with row numbers and keeps empty positions', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One']));
        batchGet.mockResolvedValue(values([['a', '', 'c'], [], ['d']]));

        const result = await make(api).readRange({
            source: source('ss', 1, 'One'),
            range: 'B5:D7',
        });

        expect(batchGet.mock.calls[0]?.[0]).toMatchObject({ ranges: ["'One'!B5:D7"] });
        expect(result).toEqual({
            sourceId: 'ss:1',
            range: 'B5:D7',
            truncated: false,
            rows: [
                {
                    rowNo: 5,
                    cells: [
                        { column: 'B', value: 'a' },
                        { column: 'C', value: '' },
                        { column: 'D', value: 'c' },
                    ],
                },
                {
                    rowNo: 6,
                    cells: [
                        { column: 'B', value: '' },
                        { column: 'C', value: '' },
                        { column: 'D', value: '' },
                    ],
                },
                {
                    rowNo: 7,
                    cells: [
                        { column: 'B', value: 'd' },
                        { column: 'C', value: '' },
                        { column: 'D', value: '' },
                    ],
                },
            ],
        });
    });

    it('stringifies non-string values', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One']));
        batchGet.mockResolvedValue(values([[1, 2.5]]));
        const result = await make(api).readRange({
            source: source('ss', 1, 'One'),
            range: 'A1:B1',
        });
        expect(result.rows[0]?.cells.map((c) => c.value)).toEqual(['1', '2.5']);
    });

    it.each(['A1', 'A:B', 'A1:B', 'One!A1:B2', 'A0:B2', 'B2:A1', 'A5:B1', 'a1:b2', "A1:B2'", ''])(
        'rejects the unbounded or malformed range %j',
        async (range) => {
            const { api, get } = fakeApi();
            get.mockResolvedValue(metadata([1, 'One']));
            const promise = make(api).readRange({ source: source('ss', 1, 'One'), range });
            expect(await codeOf(promise)).toBe('INVALID_RANGE');
            expect(get).not.toHaveBeenCalled();
        },
    );

    it('rejects a range whose single row exceeds the cell limit', async () => {
        const { api } = fakeApi();
        const promise = make(api, { maxCells: 3 }).readRange({
            source: source('ss', 1, 'One'),
            range: 'A1:D2',
        });
        expect(await codeOf(promise)).toBe('INVALID_RANGE');
    });

    it('paginates with truncated and nextRange when the cell limit is reached', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One']));
        batchGet.mockResolvedValue(
            values([
                ['a', 'b'],
                ['c', 'd'],
            ]),
        );

        const result = await make(api, { maxCells: 4 }).readRange({
            source: source('ss', 1, 'One'),
            range: 'A10:B15',
        });

        expect(batchGet.mock.calls[0]?.[0]).toMatchObject({ ranges: ["'One'!A10:B11"] });
        expect(result.truncated).toBe(true);
        expect(result.nextRange).toBe('A12:B15');
        expect(result.range).toBe('A10:B11');
        expect(result.rows.map((r) => r.rowNo)).toEqual([10, 11]);
    });

    it('is not truncated when the range fits the limit exactly', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One']));
        batchGet.mockResolvedValue(
            values([
                ['a', 'b'],
                ['c', 'd'],
            ]),
        );
        const result = await make(api, { maxCells: 4 }).readRange({
            source: source('ss', 1, 'One'),
            range: 'A1:B2',
        });
        expect(result.truncated).toBe(false);
        expect(result.nextRange).toBeUndefined();
    });

    it('supports multi-letter columns', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockResolvedValue(metadata([1, 'One']));
        batchGet.mockResolvedValue(values([['x', 'y']]));
        const result = await make(api).readRange({
            source: source('ss', 1, 'One'),
            range: 'Z3:AA3',
        });
        expect(result.rows[0]?.cells.map((c) => c.column)).toEqual(['Z', 'AA']);
    });
});

describe('GoogleSheetsReader error handling', () => {
    it.each([
        [429, 'RATE_LIMITED'],
        [504, 'TIMEOUT'],
        [408, 'TIMEOUT'],
        [503, 'SOURCE_UNAVAILABLE'],
        [403, 'SOURCE_UNAVAILABLE'],
        [404, 'SOURCE_UNAVAILABLE'],
    ])('classifies HTTP %i as %s and includes the source id', async (status, code) => {
        const { api, get } = fakeApi();
        get.mockRejectedValue(httpError(status));
        const promise = make(api, { maxAttempts: 1 }).readFingerprints([source('ss', 1, 'One')]);
        expect(await codeOf(promise)).toBe(code);
        await expect(
            make(api, { maxAttempts: 1 }).readFingerprints([source('ss', 1, 'One')]),
        ).rejects.toThrow('ss:1');
    });

    it('classifies network timeouts as TIMEOUT', async () => {
        const { api, get } = fakeApi();
        get.mockRejectedValue(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }));
        const promise = make(api, { maxAttempts: 1 }).readFingerprints([source('ss', 1, 'One')]);
        expect(await codeOf(promise)).toBe('TIMEOUT');
    });

    it('retries transient errors briefly and then succeeds', async () => {
        const { api, get, batchGet } = fakeApi();
        get.mockRejectedValueOnce(httpError(429)).mockResolvedValue(metadata([1, 'One']));
        batchGet.mockRejectedValueOnce(httpError(503)).mockResolvedValue(values([['a']]));
        const result = await make(api).readFingerprints([source('ss', 1, 'One')]);
        expect(result.has('ss:1')).toBe(true);
        expect(get).toHaveBeenCalledTimes(2);
        expect(batchGet).toHaveBeenCalledTimes(2);
    });

    it('gives up after the attempt limit', async () => {
        const { api, get } = fakeApi();
        get.mockRejectedValue(httpError(429));
        const promise = make(api, { maxAttempts: 3 }).readFingerprints([source('ss', 1, 'One')]);
        expect(await codeOf(promise)).toBe('RATE_LIMITED');
        expect(get).toHaveBeenCalledTimes(3);
    });

    it('does not retry permanent errors', async () => {
        const { api, get } = fakeApi();
        get.mockRejectedValue(httpError(403));
        await make(api)
            .readFingerprints([source('ss', 1, 'One')])
            .catch(() => undefined);
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('does not leak sheet content or raw API messages into the error', async () => {
        const { api, get } = fakeApi();
        get.mockRejectedValue(
            Object.assign(new Error('secret cell content'), { response: { status: 403 } }),
        );
        await expect(make(api).readFingerprints([source('ss', 1, 'One')])).rejects.not.toThrow(
            'secret cell content',
        );
    });
});
