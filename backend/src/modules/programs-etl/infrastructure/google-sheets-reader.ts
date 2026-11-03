import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { google, type sheets_v4 } from 'googleapis';
import type { Env } from '../../../shared/config/env.schema';
import {
    SheetsReaderPort,
    type ReadSheet,
    type SheetIdentity,
    type SheetMerge,
    type SheetMetadata,
    type SourceSpreadsheet,
} from '../application/sheets-reader.port';

const SOURCE_FILE = 'src/modules/price-policy-rag/raw-data-liks-list.json';
const SHEETS_READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export class SheetsUnavailableError extends Error {
    constructor(status?: number) {
        super(`Sheets API unavailable${status === undefined ? '' : ` (${String(status)})`}`);
        this.name = 'SheetsUnavailableError';
    }
}

export class SheetNotFoundError extends Error {
    constructor() {
        super('Sheet not found');
        this.name = 'SheetNotFoundError';
    }
}

export function loadSourceSpreadsheets(
    filePath = resolve(process.cwd(), SOURCE_FILE),
): readonly SourceSpreadsheet[] {
    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('Invalid spreadsheet source list');
    const sources = Object.entries(raw).map(([name, url]) => {
        if (typeof url !== 'string') throw new Error('Invalid spreadsheet source URL');
        const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/|$)/u.exec(url);
        if (match === null) throw new Error('Invalid spreadsheet source URL');
        return Object.freeze({ name, spreadsheetId: match[1] });
    });
    if (sources.length !== 7 || new Set(sources.map((source) => source.spreadsheetId)).size !== 7)
        throw new Error('Expected seven unique spreadsheet sources');
    return Object.freeze(sources);
}

interface ServiceAccountKey {
    type: 'service_account';
    client_email: string;
    private_key: string;
}

function isServiceAccountKey(value: unknown): value is ServiceAccountKey {
    if (value === null || typeof value !== 'object') return false;
    const key = value as Record<string, unknown>;
    return (
        key.type === 'service_account' &&
        typeof key.client_email === 'string' &&
        !!key.client_email &&
        typeof key.private_key === 'string' &&
        !!key.private_key
    );
}

export function createGoogleSheetsClient(
    config: Pick<Env, 'GOOGLE_SERVICE_ACCOUNT_JSON' | 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE'>,
): sheets_v4.Sheets {
    const inline = config.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
    const keyFile = config.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim();
    if (Boolean(inline) === Boolean(keyFile))
        throw new Error('Configure exactly one Google service account credential source');
    let raw: unknown;
    try {
        const json =
            inline !== undefined && inline.length > 0
                ? inline
                : readFileSync(resolve(keyFile ?? ''), 'utf8');
        raw = JSON.parse(json);
    } catch {
        throw new Error('Invalid Google service account credentials');
    }
    if (!isServiceAccountKey(raw)) throw new Error('Invalid Google service account credentials');
    const auth = new google.auth.JWT({
        email: raw.client_email,
        key: raw.private_key,
        scopes: [SHEETS_READ_SCOPE],
    });
    return google.sheets({ version: 'v4', auth });
}

function mergeRanges(sheet: sheets_v4.Schema$Sheet): readonly SheetMerge[] {
    return (sheet.merges ?? []).flatMap((merge) => {
        const endRowIndex = merge.endRowIndex;
        const endColumnIndex = merge.endColumnIndex;
        if (
            typeof endRowIndex !== 'number' ||
            !Number.isSafeInteger(endRowIndex) ||
            typeof endColumnIndex !== 'number' ||
            !Number.isSafeInteger(endColumnIndex)
        )
            return [];
        return [
            {
                startRowIndex: merge.startRowIndex ?? 0,
                endRowIndex,
                startColumnIndex: merge.startColumnIndex ?? 0,
                endColumnIndex,
            },
        ];
    });
}

function metadata(spreadsheetId: string, sheet: sheets_v4.Schema$Sheet): SheetMetadata | null {
    const properties = sheet.properties;
    if (
        typeof properties?.sheetId !== 'number' ||
        !Number.isSafeInteger(properties.sheetId) ||
        typeof properties.title !== 'string'
    )
        return null;
    return {
        spreadsheetId,
        sheetId: properties.sheetId,
        title: properties.title,
        hidden: properties.hidden === true,
        merges: mergeRanges(sheet),
    };
}

function apiStatus(error: unknown): number | undefined {
    if (error === null || typeof error !== 'object') return undefined;
    const response = (error as { response?: { status?: unknown } }).response;
    return typeof response?.status === 'number' && Number.isInteger(response.status)
        ? response.status
        : undefined;
}

export class GoogleSheetsReader extends SheetsReaderPort {
    private client?: sheets_v4.Sheets;

    constructor(
        private readonly clientFactory: () => sheets_v4.Sheets,
        private readonly sources: readonly SourceSpreadsheet[],
    ) {
        super();
    }

    listSources(): readonly SourceSpreadsheet[] {
        return this.sources;
    }

    async listSheets(spreadsheetId: string): Promise<readonly SheetMetadata[]> {
        this.assertKnownSource(spreadsheetId);
        try {
            const response = await this.api().spreadsheets.get({
                spreadsheetId,
                includeGridData: false,
                fields: 'sheets(properties(sheetId,title,hidden),merges)',
            });
            return (response.data.sheets ?? [])
                .map((sheet) => metadata(spreadsheetId, sheet))
                .filter((sheet): sheet is SheetMetadata => sheet !== null);
        } catch (error) {
            throw new SheetsUnavailableError(apiStatus(error));
        }
    }

    async readSheet(identity: SheetIdentity): Promise<ReadSheet> {
        const sheet = (await this.listSheets(identity.spreadsheetId)).find(
            (item) => item.sheetId === identity.sheetId,
        );
        if (!sheet) throw new SheetNotFoundError();
        try {
            const response = await this.api().spreadsheets.values.batchGet({
                spreadsheetId: identity.spreadsheetId,
                ranges: [`'${sheet.title.replaceAll("'", "''")}'`],
                valueRenderOption: 'FORMATTED_VALUE',
                majorDimension: 'ROWS',
            });
            const values = response.data.valueRanges?.[0]?.values ?? [];
            return {
                ...sheet,
                headers: (values[0] ?? []).map(String),
                rows: values.slice(1).map((cells, index) => ({
                    rowNo: index + 2,
                    cells: cells.map(String),
                })),
            };
        } catch (error) {
            throw new SheetsUnavailableError(apiStatus(error));
        }
    }

    private api(): sheets_v4.Sheets {
        this.client ??= this.clientFactory();
        return this.client;
    }

    private assertKnownSource(spreadsheetId: string): void {
        if (!this.sources.some((source) => source.spreadsheetId === spreadsheetId))
            throw new SheetNotFoundError();
    }
}
