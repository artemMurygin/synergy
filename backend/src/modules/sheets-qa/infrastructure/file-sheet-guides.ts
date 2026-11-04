import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SheetGuidesPort } from '../domain/ports/sheet-guides.port';
import { WorkbookError } from '../domain/ports/workbook-reader.port';

function key(name: string): string {
    return name.trim().toLowerCase();
}

/** Reads the structure file and `<dir>/<sheet name>.md` (or the file named by an alias); user input is only matched against the file list. */
export class FileSheetGuides extends SheetGuidesPort {
    constructor(
        private readonly structureFile: string,
        private readonly dir: string,
        /** Sheet name in the workbook mapped to the guide file name (without `.md`). */
        aliases: Readonly<Record<string, string>> = {},
    ) {
        super();
        for (const [sheet, guide] of Object.entries(aliases)) {
            this.aliases.set(key(sheet), key(guide));
        }
    }

    private readonly aliases = new Map<string, string>();

    private async files(): Promise<Map<string, string>> {
        let names: string[];
        try {
            names = await readdir(this.dir);
        } catch {
            throw new WorkbookError('The sheet guides are not available');
        }
        const guides = new Map<string, string>();
        for (const name of names) {
            if (!name.endsWith('.md')) continue;
            guides.set(key(name.slice(0, -'.md'.length)), name);
        }
        return guides;
    }

    async index(): Promise<string> {
        try {
            return await readFile(this.structureFile, 'utf8');
        } catch {
            throw new WorkbookError('The workbook structure file is not available');
        }
    }

    async guide(sheet: string): Promise<string> {
        const files = await this.files();
        const file = files.get(this.aliases.get(key(sheet)) ?? key(sheet));
        if (file === undefined) {
            const names = [...files.values()].map((name) => name.slice(0, -'.md'.length)).sort();
            throw new WorkbookError(
                `No guide for sheet "${sheet}". Sheets with a guide: ${names.join(', ')}`,
            );
        }
        return readFile(join(this.dir, file), 'utf8');
    }
}
