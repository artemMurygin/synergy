import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

/** An internal hyperlink: a cell of one sheet that points to a row of another sheet. */
export interface InternalLink {
    readonly sheet: string;
    readonly column: string;
    readonly row: number;
    readonly targetSheet: string;
    readonly targetRow: number;
}

/** Name Google gives to the target sheet of some exported links (`null!4:4`): the sheet is lost. */
export const UNNAMED_SHEET = 'null';

const ENTITIES: Readonly<Record<string, string>> = {
    '&amp;': '&',
    '&apos;': "'",
    '&quot;': '"',
    '&lt;': '<',
    '&gt;': '>',
};

function decode(text: string): string {
    return text.replace(/&(?:amp|apos|quot|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity);
}

function attribute(tag: string, name: string): string | undefined {
    const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.at(1);
    return value === undefined ? undefined : decode(value);
}

function firstRow(range: string): number | undefined {
    const digits = /(\d+)/.exec(range)?.at(1);
    return digits === undefined ? undefined : Number(digits);
}

/** Parses `'Sheet name'!3:3`, `Sheet!A3` and `gid=123&range=3:3`; unknown gids are skipped. */
export function parseLocation(
    location: string,
    gids: Readonly<Partial<Record<string, string>>>,
): { sheet: string; row: number } | undefined {
    const quoted = /^'((?:[^']|'')+)'!(.+)$/.exec(location);
    const plain = /^([^'!]+)!(.+)$/.exec(location);
    const named = quoted ?? plain;
    const name = named?.at(1);
    const range = named?.at(2);
    if (name !== undefined && range !== undefined) {
        const row = firstRow(range);
        return row === undefined ? undefined : { sheet: name.replace(/''/g, "'"), row };
    }
    const gid = /gid=(\d+)(?:&range=(.+))?/.exec(location);
    const gidRange = gid?.at(2);
    const sheet = gids[gid?.at(1) ?? ''];
    if (sheet !== undefined && gidRange !== undefined) {
        const row = firstRow(gidRange);
        return row === undefined ? undefined : { sheet, row };
    }
    return undefined;
}

async function sheetFiles(zip: JSZip): Promise<Map<string, string>> {
    const workbook = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
    const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
    const targets = new Map<string, string>();
    for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
        const id = attribute(tag, 'Id');
        const target = attribute(tag, 'Target');
        if (id !== undefined && target !== undefined) {
            targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
        }
    }
    const files = new Map<string, string>();
    for (const tag of workbook.match(/<sheet\b[^>]*>/g) ?? []) {
        const name = attribute(tag, 'name');
        const id = attribute(tag, 'r:id');
        const file = id === undefined ? undefined : targets.get(id);
        if (name !== undefined && file !== undefined) files.set(name, file);
    }
    return files;
}

/**
 * Reads the internal hyperlinks (`location` attribute) of the given sheets straight from the
 * workbook XML: the xlsx library does not expose them.
 */
export async function readInternalLinks(
    file: string,
    sheets: ReadonlySet<string>,
    gids: Readonly<Partial<Record<string, string>>>,
): Promise<InternalLink[]> {
    const zip = await JSZip.loadAsync(await readFile(file));
    const files = await sheetFiles(zip);
    const links: InternalLink[] = [];
    for (const [name, path] of files) {
        if (!sheets.has(name.trim())) continue;
        const xml = (await zip.file(path)?.async('string')) ?? '';
        for (const tag of xml.match(/<hyperlink\b[^>]*>/g) ?? []) {
            const ref = /^([A-Z]+)(\d+)/.exec(attribute(tag, 'ref') ?? '');
            const column = ref?.at(1);
            const row = ref?.at(2);
            const location = attribute(tag, 'location');
            const target = location === undefined ? undefined : parseLocation(location, gids);
            if (column === undefined || row === undefined || target === undefined) continue;
            links.push({
                sheet: name.trim(),
                column,
                row: Number(row),
                targetSheet: target.sheet.trim(),
                targetRow: target.row,
            });
        }
    }
    return links;
}
