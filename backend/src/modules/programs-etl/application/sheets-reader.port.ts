import type { createSheetIdentity } from '../domain/value-objects';

export type SheetIdentity = ReturnType<typeof createSheetIdentity>;

export interface SourceSpreadsheet {
    readonly name: string;
    readonly spreadsheetId: string;
}

export interface SheetMerge {
    readonly startRowIndex: number;
    readonly endRowIndex: number;
    readonly startColumnIndex: number;
    readonly endColumnIndex: number;
}

export interface SheetMetadata extends SheetIdentity {
    readonly title: string;
    readonly hidden: boolean;
    readonly merges: readonly SheetMerge[];
}

export interface ReadSheet extends SheetMetadata {
    readonly headers: readonly string[];
    readonly rows: readonly { rowNo: number; cells: readonly string[] }[];
}

export abstract class SheetsReaderPort {
    abstract listSources(): readonly SourceSpreadsheet[];
    abstract listSheets(spreadsheetId: string): Promise<readonly SheetMetadata[]>;
    abstract readSheet(identity: SheetIdentity): Promise<ReadSheet>;
}
