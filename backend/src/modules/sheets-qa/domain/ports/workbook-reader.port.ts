export interface SheetInfo {
    readonly name: string;
    readonly rows: number;
    readonly columns: number;
    readonly hidden: boolean;
    /** True when the sheet has a described layout (header rows are labelled). */
    readonly described: boolean;
}

export interface CellHit {
    readonly sheet: string;
    readonly row: number;
    readonly column: string;
    readonly text: string;
    /** Queries (by index in the request) the cell matched. */
    readonly queries: readonly number[];
}

export interface RowCell {
    readonly column: string;
    readonly value: string;
    readonly link?: string;
}

export interface SheetRow {
    readonly row: number;
    /** Nearest section header above the row (e.g. the faculty). */
    readonly section?: string;
    readonly cells: readonly RowCell[];
}

export interface RowsPage {
    /** Header label of every returned column (joined header rows), given once per page. */
    readonly columnLabels: Readonly<Record<string, string>>;
    readonly rows: readonly SheetRow[];
    readonly truncated: boolean;
}

export interface RowLink {
    readonly column: string;
    readonly text: string;
    readonly url: string;
}

export interface RelatedRow {
    readonly sheet: string;
    readonly row: number;
    readonly relation: string;
    readonly note?: string;
}

/** Error whose message the model can read and correct itself. */
export class WorkbookError extends Error {}

/** Read-only access to the exported workbook. */
export abstract class WorkbookReaderPort {
    abstract listSheets(): Promise<SheetInfo[]>;
    /** A cell is found when it matches ANY of the queries; a query matches when ALL its words are in the cell. */
    abstract searchCells(
        queries: readonly string[],
        sheet?: string,
    ): Promise<{ hits: CellHit[]; truncated: boolean }>;
    abstract readRows(
        sheet: string,
        fromRow: number,
        toRow: number,
        columns?: readonly string[],
    ): Promise<RowsPage>;
    abstract getRowLinks(sheet: string, row: number): Promise<RowLink[]>;
    abstract findRelated(sheet: string, row: number): Promise<RelatedRow[]>;
}
