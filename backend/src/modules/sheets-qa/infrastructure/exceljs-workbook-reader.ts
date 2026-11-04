import { stat } from 'node:fs/promises';
import { Workbook, type Cell, type CellValue, type Worksheet } from 'exceljs';
import {
    WorkbookError,
    WorkbookReaderPort,
    type CellHit,
    type RelatedRow,
    type RowCell,
    type RowLink,
    type RowsPage,
    type SheetInfo,
    type SheetRow,
} from '../domain/ports/workbook-reader.port';
import {
    LINK_TITLE_MIN_SIMILARITY,
    type LinkRelationRule,
    type SheetLayout,
} from '../sheets-qa.config';
import { readInternalLinks, UNNAMED_SHEET, type InternalLink } from './internal-links';
import {
    assignByName,
    normalizeName,
    similarity,
    titleSimilarity,
    type MatchCandidate,
} from './name-matching';

export interface WorkbookReaderOptions {
    readonly file: string;
    readonly layouts: Readonly<Partial<Record<string, SheetLayout>>>;
    readonly overrides: Readonly<Partial<Record<string, string>>>;
    /** Hyperlink columns that carry relations; the primary source for find_related. */
    readonly linkRules: readonly LinkRelationRule[];
    /** Sheets that hyperlinks name by gid. */
    readonly gids: Readonly<Partial<Record<string, string>>>;
    /** Program-name similarity below which a link is reported with a note to verify it. */
    readonly linkTitleMinSimilarity?: number;
    readonly limits: {
        readonly maxRowsPerRead: number;
        readonly maxSearchHits: number;
        readonly maxCellChars: number;
    };
}

const SPO = 'СПО';
const METHODICAL = 'МБ СПО';
const QUALIFICATION = 'МБ квалификация';
const MAX_LABEL_CHARS = 140;
const DIFFERENT_NAME_NOTE = 'link target has a different name; verify';

export function cellText(value: CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('formula' in value || 'sharedFormula' in value) {
        return value.result === undefined ? '' : cellText(value.result);
    }
    if ('text' in value) {
        return typeof value.text === 'string' ? value.text : cellText(value.text);
    }
    if ('error' in value) return value.error;
    return '';
}

function tidy(text: string): string {
    return text
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
}

function isMergedSlave(cell: Cell): boolean {
    return cell.isMerged && cell.master.address !== cell.address;
}

function hyperlinkOf(cell: Cell): string | undefined {
    const value = cell.value;
    if (value === null || typeof value !== 'object') return undefined;
    if ('hyperlink' in value) return value.hyperlink;
    if ('formula' in value && typeof value.formula === 'string') {
        return /^HYPERLINK\("([^"]+)"/i.exec(value.formula)?.[1];
    }
    return undefined;
}

function facultyKey(text: string): string {
    const head = text.split(/\n| м\. /)[0] ?? '';
    return normalizeName(head)
        .replace(/\bфакультет\b/g, '')
        .trim();
}

interface Loaded {
    readonly workbook: Workbook;
    readonly links: readonly InternalLink[];
    readonly mtimeMs: number;
    relations?: Map<string, RelatedRow[]>;
}

export class ExcelJsWorkbookReader extends WorkbookReaderPort {
    private loaded: Loaded | undefined;

    constructor(private readonly options: WorkbookReaderOptions) {
        super();
    }

    private async book(): Promise<Loaded> {
        let mtimeMs: number;
        try {
            mtimeMs = (await stat(this.options.file)).mtimeMs;
        } catch {
            throw new WorkbookError('The workbook file is not available');
        }
        if (this.loaded?.mtimeMs === mtimeMs) return this.loaded;
        const workbook = new Workbook();
        await workbook.xlsx.readFile(this.options.file);
        const links = await readInternalLinks(
            this.options.file,
            new Set(this.options.linkRules.map((rule) => rule.sheet)),
            this.options.gids,
        );
        this.loaded = { workbook, links, mtimeMs };
        return this.loaded;
    }

    private sheet(book: Loaded, name: string): Worksheet {
        const wanted = name.trim().toLowerCase();
        const found = book.workbook.worksheets.find(
            (ws) => ws.name.trim().toLowerCase() === wanted,
        );
        if (found === undefined) {
            const names = book.workbook.worksheets.map((ws) => ws.name.trim()).join(', ');
            throw new WorkbookError(`Unknown sheet "${name}". Sheets: ${names}`);
        }
        return found;
    }

    private layoutOf(ws: Worksheet): SheetLayout | undefined {
        return this.options.layouts[ws.name.trim()];
    }

    /** False for hidden columns and for hidden cells; such a cell is never searched, read or linked. */
    private visible(ws: Worksheet, column: string, row: number): boolean {
        const layout = this.layoutOf(ws);
        if (layout?.hiddenColumns?.includes(column) === true) return false;
        return !(layout?.hiddenCells ?? []).some(
            (hidden) =>
                hidden.column === column &&
                hidden.rows.some(([from, to]) => row >= from && row <= to),
        );
    }

    private clip(text: string): string {
        const max = this.options.limits.maxCellChars;
        return text.length > max ? `${text.slice(0, max)}…` : text;
    }

    private columnLabels(ws: Worksheet): Record<string, string> {
        const layout = this.layoutOf(ws);
        const labels: Record<string, string> = {};
        if (layout === undefined) return labels;
        for (let col = 1; col <= ws.columnCount; col += 1) {
            const parts: string[] = [];
            for (const row of layout.headerRows) {
                const text = tidy(cellText(ws.getCell(row, col).value)).replace(/\s+/g, ' ');
                if (text.length > 0 && parts.at(-1) !== text) parts.push(text);
            }
            if (parts.length > 0) {
                const label = parts.join(' / ');
                labels[ws.getColumn(col).letter] =
                    label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS)}…` : label;
            }
        }
        return labels;
    }

    /** Non-empty cells of a row that carry their own value (merged copies are skipped). */
    private rowCells(ws: Worksheet, rowNumber: number): { cell: Cell; text: string }[] {
        const result: { cell: Cell; text: string }[] = [];
        ws.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
            if (isMergedSlave(cell)) return;
            const text = tidy(cellText(cell.value));
            if (text.length > 0) result.push({ cell, text });
        });
        return result;
    }

    private sectionOf(ws: Worksheet, row: number): string | undefined {
        const layout = this.layoutOf(ws);
        if (layout === undefined) return undefined;
        for (let r = row; r >= layout.firstDataRow; r -= 1) {
            const cells = this.rowCells(ws, r);
            const only = cells.length === 1 ? cells[0] : undefined;
            if (only?.cell.isMerged === true) {
                const column = ws.getColumn(Number(only.cell.col)).letter;
                if (this.visible(ws, column, r)) return only.text.replace(/\n+/g, ', ');
            }
        }
        return undefined;
    }

    listSheets(): Promise<SheetInfo[]> {
        return this.book().then((book) =>
            book.workbook.worksheets.map((ws) => ({
                name: ws.name.trim(),
                rows: ws.rowCount,
                columns: ws.columnCount,
                hidden: ws.state !== 'visible',
                described: this.layoutOf(ws) !== undefined,
            })),
        );
    }

    async searchCells(
        queries: readonly string[],
        sheet?: string,
    ): Promise<{ hits: CellHit[]; truncated: boolean }> {
        const parsed = queries.map((query) =>
            tidy(query).toLowerCase().split(/\s+/).filter(Boolean),
        );
        if (parsed.length === 0 || parsed.some((tokens) => tokens.length === 0)) {
            throw new WorkbookError('Queries must not be empty');
        }
        const book = await this.book();
        const sheets = sheet === undefined ? book.workbook.worksheets : [this.sheet(book, sheet)];
        const hits: CellHit[] = [];
        for (const ws of sheets) {
            for (let r = 1; r <= ws.rowCount; r += 1) {
                for (const { cell, text } of this.rowCells(ws, r)) {
                    const column = ws.getColumn(Number(cell.col)).letter;
                    if (!this.visible(ws, column, r)) continue;
                    const haystack = text.toLowerCase().replace(/\s+/g, ' ');
                    const matched = parsed.flatMap((tokens, index) =>
                        tokens.every((token) => haystack.includes(token)) ? [index] : [],
                    );
                    if (matched.length === 0) continue;
                    if (hits.length >= this.options.limits.maxSearchHits) {
                        return { hits, truncated: true };
                    }
                    hits.push({
                        sheet: ws.name.trim(),
                        row: r,
                        column,
                        text: this.clip(text.replace(/\s+/g, ' ')),
                        queries: matched,
                    });
                }
            }
        }
        return { hits, truncated: false };
    }

    async readRows(
        sheet: string,
        fromRow: number,
        toRow: number,
        columns?: readonly string[],
    ): Promise<RowsPage> {
        const book = await this.book();
        const ws = this.sheet(book, sheet);
        if (fromRow < 1 || toRow < fromRow) throw new WorkbookError('Invalid row range');
        const last = Math.min(toRow, ws.rowCount);
        const capped = Math.min(last, fromRow + this.options.limits.maxRowsPerRead - 1);
        const wanted = columns?.map((c) => c.toUpperCase());
        const rows: SheetRow[] = [];
        const used = new Set<string>();
        for (let r = fromRow; r <= capped; r += 1) {
            const cells: RowCell[] = [];
            for (const { cell, text } of this.rowCells(ws, r)) {
                const column = ws.getColumn(Number(cell.col)).letter;
                if (!this.visible(ws, column, r)) continue;
                if (wanted !== undefined && !wanted.includes(column)) continue;
                const link = hyperlinkOf(cell);
                used.add(column);
                cells.push({
                    column,
                    value: this.clip(text),
                    ...(link === undefined ? {} : { link }),
                });
            }
            if (cells.length === 0) continue;
            const section = this.sectionOf(ws, r);
            rows.push({ row: r, ...(section === undefined ? {} : { section }), cells });
        }
        const allLabels = this.columnLabels(ws);
        const columnLabels = Object.fromEntries(
            Object.entries(allLabels).filter(([letter]) => used.has(letter)),
        );
        return { columnLabels, rows, truncated: capped < last };
    }

    async getRowLinks(sheet: string, row: number): Promise<RowLink[]> {
        const book = await this.book();
        const ws = this.sheet(book, sheet);
        const links: RowLink[] = [];
        for (const { cell, text } of this.rowCells(ws, row)) {
            const column = ws.getColumn(Number(cell.col)).letter;
            const url = hyperlinkOf(cell);
            if (url !== undefined && this.visible(ws, column, row)) {
                links.push({ column, text: this.clip(text.replace(/\s+/g, ' ')), url });
            }
        }
        return links;
    }

    async findRelated(sheet: string, row: number): Promise<RelatedRow[]> {
        const book = await this.book();
        const ws = this.sheet(book, sheet);
        book.relations ??= this.mergeRelations(
            this.buildLinkRelations(book),
            this.buildRelations(book),
        );
        return book.relations.get(`${ws.name.trim()}!${String(row)}`) ?? [];
    }

    /** Relations from the hyperlinks of the price sheets, plus the reverse side on the target rows. */
    private buildLinkRelations(book: Loaded): Map<string, RelatedRow[]> {
        const relations = new Map<string, RelatedRow[]>();
        const sheets = new Map(book.workbook.worksheets.map((ws) => [ws.name.trim(), ws]));
        const add = (sheet: string, row: number, related: RelatedRow): void => {
            const key = `${sheet}!${String(row)}`;
            const current = relations.get(key) ?? [];
            const index = current.findIndex(
                (item) =>
                    item.sheet === related.sheet &&
                    item.row === related.row &&
                    item.relation === related.relation,
            );
            if (index < 0) {
                relations.set(key, [...current, related]);
            } else if (current[index]?.note !== undefined && related.note === undefined) {
                // another column confirms the link
                relations.set(
                    key,
                    current.map((item, i) => (i === index ? related : item)),
                );
            }
        };
        const minSimilarity = this.options.linkTitleMinSimilarity ?? LINK_TITLE_MIN_SIMILARITY;
        for (const link of book.links) {
            const rule = this.options.linkRules.find(
                (item) =>
                    item.sheet === link.sheet &&
                    item.column === link.column &&
                    (item.rows === undefined ||
                        item.rows.some(([from, to]) => link.row >= from && link.row <= to)),
            );
            if (rule === undefined) continue;
            const targetName =
                link.targetSheet === UNNAMED_SHEET ? rule.targetSheet : link.targetSheet;
            if (targetName === undefined) continue;
            if (rule.targetSheet !== undefined && targetName !== rule.targetSheet) continue;
            const target = sheets.get(targetName);
            if (target === undefined || link.targetRow > target.rowCount) continue;
            const note =
                rule.title !== undefined &&
                this.hasDifferentName(
                    rule.title,
                    sheets.get(link.sheet),
                    link.row,
                    target,
                    link.targetRow,
                    minSimilarity,
                )
                    ? DIFFERENT_NAME_NOTE
                    : undefined;
            const noted = note === undefined ? {} : { note };
            add(link.sheet, link.row, {
                sheet: targetName,
                row: link.targetRow,
                relation: rule.relation,
                ...noted,
            });
            add(targetName, link.targetRow, {
                sheet: link.sheet,
                row: link.row,
                relation: 'price_row',
                ...noted,
            });
        }
        return relations;
    }

    /** True when both rows have a program name and the names are not similar enough. */
    private hasDifferentName(
        title: NonNullable<LinkRelationRule['title']>,
        source: Worksheet | undefined,
        sourceRow: number,
        target: Worksheet,
        targetRow: number,
        minSimilarity: number,
    ): boolean {
        if (source === undefined) return false;
        const read = (ws: Worksheet, row: number, columns: readonly string[]): string =>
            columns
                .map((column) => cellText(ws.getCell(`${column}${String(row)}`).value))
                .join(' ');
        const left = read(source, sourceRow, title.source);
        const right = read(target, targetRow, title.target);
        if (titleSimilarity(left, left) === 0 || titleSimilarity(right, right) === 0) return false;
        return titleSimilarity(left, right) < minSimilarity;
    }

    /** Hyperlink relations win; a relation kind without a hyperlink falls back to name matching. */
    private mergeRelations(
        byLinks: Map<string, RelatedRow[]>,
        byNames: Map<string, RelatedRow[]>,
    ): Map<string, RelatedRow[]> {
        const merged = new Map<string, RelatedRow[]>();
        for (const key of new Set([...byLinks.keys(), ...byNames.keys()])) {
            const linked = byLinks.get(key) ?? [];
            const kinds = new Set(linked.map((item) => item.relation));
            const guessed = (byNames.get(key) ?? [])
                .filter((item) => !kinds.has(item.relation))
                .map((item) => ({
                    ...item,
                    note: [item.note, 'matched by names, no hyperlink; verify']
                        .filter((part) => part !== undefined)
                        .join('; '),
                }));
            merged.set(key, [...linked, ...guessed]);
        }
        return merged;
    }

    private buildRelations(book: Loaded): Map<string, RelatedRow[]> {
        const relations = new Map<string, RelatedRow[]>();
        const add = (sheet: string, row: number, related: RelatedRow): void => {
            const key = `${sheet}!${String(row)}`;
            relations.set(key, [...(relations.get(key) ?? []), related]);
        };
        const find = (name: string): Worksheet | undefined =>
            book.workbook.worksheets.find((ws) => ws.name.trim() === name);
        const spo = find(SPO);
        const methodical = find(METHODICAL);
        const qualification = find(QUALIFICATION);
        if (spo === undefined) return relations;

        const spoLayout = this.options.layouts[SPO];
        const programs: (MatchCandidate & { project: string })[] = [];
        for (let r = spoLayout?.firstDataRow ?? 1; r <= spo.rowCount; r += 1) {
            const title = tidy(cellText(spo.getCell(r, 3).value));
            const qual = tidy(cellText(spo.getCell(r, 4).value));
            if (title.length === 0 || qual.length === 0) continue;
            programs.push({
                row: r,
                faculty: facultyKey(this.sectionOf(spo, r) ?? ''),
                text: normalizeName(`${title} ${qual}`),
                project: tidy(cellText(spo.getCell(r, 6).value)),
            });
        }

        if (methodical !== undefined) {
            const targets: MatchCandidate[] = [];
            for (
                let r = this.options.layouts[METHODICAL]?.firstDataRow ?? 1;
                r <= methodical.rowCount;
                r += 1
            ) {
                const text = tidy(cellText(methodical.getCell(r, 3).value));
                if (text.length === 0) continue;
                targets.push({
                    row: r,
                    faculty: facultyKey(tidy(cellText(methodical.getCell(r, 2).value))),
                    text: normalizeName(text),
                });
            }
            const owner = new Map<number, number>();
            for (const match of assignByName(programs, targets))
                owner.set(match.source, match.target);
            for (const [from, to] of Object.entries(this.options.overrides)) {
                const parts = from.split('!');
                const fromRow = parts.at(1);
                if (parts.at(0) !== SPO || fromRow === undefined) continue;
                const toRow = Number((to ?? '').split('!')[1]);
                if (Number.isInteger(toRow)) owner.set(Number(fromRow), toRow);
                else owner.delete(Number(fromRow));
            }
            const byTarget = new Map<number, number>(
                [...owner].map(([source, target]) => [target, source]),
            );
            for (const [source, target] of owner) {
                add(SPO, source, { sheet: METHODICAL, row: target, relation: 'methodical_base' });
                add(METHODICAL, target, { sheet: SPO, row: source, relation: 'price_row' });
            }
            for (const target of targets) {
                if (byTarget.has(target.row)) continue;
                const twin = targets.find(
                    (other) =>
                        byTarget.has(other.row) &&
                        similarity(other.text, target.text) >= 0.95 &&
                        similarity(other.faculty, target.faculty) >= 0.8,
                );
                const source = twin === undefined ? undefined : byTarget.get(twin.row);
                if (twin === undefined || source === undefined) continue;
                add(SPO, source, {
                    sheet: METHODICAL,
                    row: target.row,
                    relation: 'methodical_base',
                    note: `duplicate of row ${String(twin.row)}`,
                });
                add(METHODICAL, target.row, {
                    sheet: SPO,
                    row: source,
                    relation: 'price_row',
                    note: `duplicate of row ${String(twin.row)}`,
                });
            }
        }

        if (qualification !== undefined) {
            const projects: { row: number; name: string; faculty: string }[] = [];
            for (
                let r = this.options.layouts[QUALIFICATION]?.firstDataRow ?? 1;
                r <= qualification.rowCount;
                r += 1
            ) {
                const name = normalizeName(cellText(qualification.getCell(r, 2).value));
                if (name.length > 0) {
                    projects.push({
                        row: r,
                        name,
                        faculty: facultyKey(cellText(qualification.getCell(r, 1).value)),
                    });
                }
            }
            for (const program of programs) {
                const name = normalizeName(program.project);
                const best = projects
                    .filter((project) => project.name === name)
                    .map((project) => ({
                        project,
                        score: similarity(project.faculty, program.faculty),
                    }))
                    .sort((a, b) => b.score - a.score)
                    .at(0);
                if (best !== undefined) {
                    add(SPO, program.row, {
                        sheet: QUALIFICATION,
                        row: best.project.row,
                        relation: 'qualification_project',
                    });
                }
            }
        }
        return relations;
    }
}
