import { createHash } from 'node:crypto';
import type { sheets_v4 } from 'googleapis';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type { GroupSource } from '../application/models/programs-group';
import type { BoundedA1Range, SheetRangeResult, SheetRow } from '../application/models/sheets';
import type { SourceFingerprint } from '../application/models/source-fingerprint';
import type { SheetsReaderPort } from '../application/ports/programs-etl.ports';

export interface GoogleSheetsReaderOptions {
    /** Cell limit of one `readRange` response. */
    readonly maxCells: number;
    /** Total attempts for a transient Google API error within one call. */
    readonly maxAttempts?: number;
    readonly retryDelayMs?: number;
    /** Injectable for tests. */
    readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 200;
const BOUNDED_A1 = /^([A-Z]{1,3})([1-9]\d{0,6}):([A-Z]{1,3})([1-9]\d{0,6})$/;
const TRANSIENT_TIMEOUT_CODES = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ESOCKETTIMEDOUT',
    'EAI_AGAIN',
]);

function columnToNumber(column: string): number {
    let n = 0;
    for (const char of column) n = n * 26 + (char.charCodeAt(0) - 64);
    return n;
}

function numberToColumn(n: number): string {
    let rest = n;
    let column = '';
    while (rest > 0) {
        const mod = (rest - 1) % 26;
        column = String.fromCharCode(65 + mod) + column;
        rest = Math.floor((rest - 1) / 26);
    }
    return column;
}

function quoteTitle(title: string): string {
    return `'${title.replaceAll("'", "''")}'`;
}

function httpStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const record = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
    const status = record.response?.status ?? record.status;
    if (typeof status === 'number') return status;
    return typeof record.code === 'number' ? record.code : undefined;
}

function errorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
}

type FailureCode = 'RATE_LIMITED' | 'TIMEOUT' | 'SOURCE_UNAVAILABLE';

function classify(error: unknown): { code: FailureCode; transient: boolean } {
    const status = httpStatus(error);
    if (status === 429) return { code: 'RATE_LIMITED', transient: true };
    if (status === 408 || status === 504) return { code: 'TIMEOUT', transient: true };
    const networkCode = errorCode(error);
    if (networkCode !== undefined && TRANSIENT_TIMEOUT_CODES.has(networkCode)) {
        return { code: 'TIMEOUT', transient: true };
    }
    return {
        code: 'SOURCE_UNAVAILABLE',
        transient: status !== undefined && status >= 500 && status < 600,
    };
}

function cellValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/** Google Sheets adapter of `SheetsReaderPort`; SDK types stay inside this file. */
export class GoogleSheetsReader implements SheetsReaderPort {
    private readonly maxAttempts: number;
    private readonly retryDelayMs: number;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(
        private readonly api: sheets_v4.Sheets,
        private readonly options: GoogleSheetsReaderOptions,
    ) {
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
        this.sleep =
            options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    }

    async readFingerprints(sources: GroupSource[]): Promise<Map<string, SourceFingerprint>> {
        const bySpreadsheet = new Map<string, GroupSource[]>();
        for (const source of sources) {
            const list = bySpreadsheet.get(source.spreadsheetId) ?? [];
            list.push(source);
            bySpreadsheet.set(source.spreadsheetId, list);
        }
        const result = new Map<string, SourceFingerprint>();
        let firstError: unknown;
        // Failures are isolated per spreadsheet and per sheet: healthy sources are still read.
        for (const [spreadsheetId, group] of bySpreadsheet) {
            const label = group.map((s) => s.sourceId).join(',');
            try {
                const titles = await this.fetchTitles(spreadsheetId, label);
                const present = group.filter((source) => titles.has(source.sheetId));
                for (const source of group) {
                    if (!titles.has(source.sheetId)) {
                        firstError ??= this.missingSheet(source);
                    }
                }
                if (present.length === 0) continue;
                const ranges = present.map((source) =>
                    quoteTitle(titles.get(source.sheetId) ?? ''),
                );
                const valueRanges = await this.batchGet(spreadsheetId, ranges, label);
                present.forEach((source, index) => {
                    const rows = valueRanges[index]?.values ?? [];
                    result.set(source.sourceId, { value: this.hash(rows) });
                });
            } catch (error) {
                firstError ??= error;
            }
        }
        if (result.size === 0 && firstError !== undefined)
            throw firstError instanceof Error
                ? firstError
                : new Error('Unexpected failure', { cause: firstError });
        return result;
    }

    async readRange(input: {
        source: GroupSource;
        range: BoundedA1Range;
    }): Promise<SheetRangeResult> {
        const { source } = input;
        const match = BOUNDED_A1.exec(input.range);
        if (match === null) {
            throw new ProgramsSyncError(
                'INVALID_RANGE',
                `Range must be a bounded A1 range like A1:F200 (${source.sourceId})`,
            );
        }
        const startCol = columnToNumber(match[1]);
        const endCol = columnToNumber(match[3]);
        const startRow = Number(match[2]);
        const endRow = Number(match[4]);
        if (startCol > endCol || startRow > endRow) {
            throw new ProgramsSyncError(
                'INVALID_RANGE',
                `Range start must not exceed its end (${source.sourceId})`,
            );
        }
        const width = endCol - startCol + 1;
        const rowsPerPage = Math.floor(this.options.maxCells / width);
        if (rowsPerPage < 1) {
            throw new ProgramsSyncError(
                'INVALID_RANGE',
                `Range row is wider than the cell limit ${String(this.options.maxCells)} (${source.sourceId})`,
            );
        }
        const pageEndRow = Math.min(endRow, startRow + rowsPerPage - 1);
        const truncated = pageEndRow < endRow;
        const startLetter = numberToColumn(startCol);
        const endLetter = numberToColumn(endCol);
        const returnedRange = `${startLetter}${String(startRow)}:${endLetter}${String(pageEndRow)}`;

        const titles = await this.resolveTitles(source.spreadsheetId, [source], source.sourceId);
        const valueRanges = await this.batchGet(
            source.spreadsheetId,
            [`${quoteTitle(titles.get(source.sheetId) ?? '')}!${returnedRange}`],
            source.sourceId,
        );
        const values = valueRanges[0]?.values ?? [];

        const rows: SheetRow[] = [];
        for (let offset = 0; offset <= pageEndRow - startRow; offset++) {
            const raw = values[offset] ?? [];
            rows.push({
                rowNo: startRow + offset,
                cells: Array.from({ length: width }, (_, i) => ({
                    column: numberToColumn(startCol + i),
                    value: cellValue(raw[i]),
                })),
            });
        }
        const base = { sourceId: source.sourceId, range: returnedRange, rows, truncated };
        return truncated
            ? {
                  ...base,
                  nextRange: `${startLetter}${String(pageEndRow + 1)}:${endLetter}${String(endRow)}`,
              }
            : base;
    }

    /** Hash of formatted non-empty cells together with their coordinates. */
    private hash(rows: readonly unknown[][]): string {
        const hash = createHash('sha256');
        rows.forEach((row, rowIndex) => {
            row.forEach((raw, colIndex) => {
                const value = cellValue(raw);
                if (value === '') return;
                hash.update(JSON.stringify([rowIndex + 1, colIndex + 1, value]));
                hash.update('\n');
            });
        });
        return hash.digest('hex');
    }

    private async resolveTitles(
        spreadsheetId: string,
        sources: readonly GroupSource[],
        label: string,
    ): Promise<Map<number, string>> {
        const titles = await this.fetchTitles(spreadsheetId, label);
        for (const source of sources) {
            if (!titles.has(source.sheetId)) throw this.missingSheet(source);
        }
        return titles;
    }

    private missingSheet(source: GroupSource): ProgramsSyncError {
        return new ProgramsSyncError(
            'SOURCE_UNAVAILABLE',
            `Sheet not found in spreadsheet (${source.sourceId})`,
        );
    }

    private async fetchTitles(spreadsheetId: string, label: string): Promise<Map<number, string>> {
        const response = await this.withRetry(label, () =>
            this.api.spreadsheets.get({
                spreadsheetId,
                includeGridData: false,
                fields: 'sheets(properties(sheetId,title))',
            }),
        );
        const titles = new Map<number, string>();
        for (const sheet of response.data.sheets ?? []) {
            const { sheetId, title } = sheet.properties ?? {};
            if (typeof sheetId === 'number' && typeof title === 'string') {
                titles.set(sheetId, title);
            }
        }
        return titles;
    }

    private async batchGet(
        spreadsheetId: string,
        ranges: string[],
        label: string,
    ): Promise<sheets_v4.Schema$ValueRange[]> {
        const response = await this.withRetry(label, () =>
            this.api.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges,
                valueRenderOption: 'FORMATTED_VALUE',
                majorDimension: 'ROWS',
            }),
        );
        return response.data.valueRanges ?? [];
    }

    /** Short retry of transient errors; the thrown error carries no API message or content. */
    private async withRetry<T>(label: string, call: () => Promise<T>): Promise<T> {
        for (let attempt = 1; ; attempt++) {
            try {
                return await call();
            } catch (error) {
                const { code, transient } = classify(error);
                if (!transient || attempt >= this.maxAttempts) {
                    const status = httpStatus(error);
                    throw new ProgramsSyncError(
                        code,
                        `Google Sheets read failed (${label})${status === undefined ? '' : `: HTTP ${String(status)}`}`,
                    );
                }
                await this.sleep(this.retryDelayMs * attempt);
            }
        }
    }
}
