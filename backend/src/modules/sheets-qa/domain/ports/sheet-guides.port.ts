/** Short descriptions of the workbook sheets kept as markdown files next to the workbook. */
export abstract class SheetGuidesPort {
    /** The structure of the workbook (`ЦП.md`): a short description of every sheet and links to the guides. */
    abstract index(): Promise<string>;
    /** The detailed guide of one sheet; throws WorkbookError with the available names if unknown. */
    abstract guide(sheet: string): Promise<string>;
}
