/** Bounded A1 range such as `A1:F200`; validated by the reader adapter. */
export type BoundedA1Range = string;

export interface SheetCell {
    readonly column: string;
    readonly value: string;
}

export interface SheetRow {
    readonly rowNo: number;
    readonly cells: readonly SheetCell[];
}

export interface SheetRangeResult {
    readonly sourceId: string;
    readonly range: BoundedA1Range;
    readonly rows: readonly SheetRow[];
    readonly truncated: boolean;
    readonly nextRange?: BoundedA1Range;
}
