import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseLocation, readInternalLinks, UNNAMED_SHEET } from './internal-links';

describe('parseLocation', () => {
    const gids = { '1816278612': 'МБ квалификация' };

    it('reads a quoted sheet name with a row range', () => {
        expect(parseLocation("'МБ СПО'!3:3", gids)).toEqual({ sheet: 'МБ СПО', row: 3 });
        expect(parseLocation("'Won''t'!$B$12", gids)).toEqual({ sheet: "Won't", row: 12 });
    });

    it('reads a plain sheet name and a cell reference', () => {
        expect(parseLocation('СПО!A7:B9', gids)).toEqual({ sheet: 'СПО', row: 7 });
    });

    it('keeps the placeholder name of an exported link whose sheet is lost', () => {
        expect(parseLocation('null!4:4', gids)).toEqual({ sheet: UNNAMED_SHEET, row: 4 });
    });

    it('resolves a gid link through the known gids and skips unknown ones', () => {
        expect(parseLocation('gid=1816278612&range=14:14', gids)).toEqual({
            sheet: 'МБ квалификация',
            row: 14,
        });
        expect(parseLocation('gid=1&range=2:2', gids)).toBeUndefined();
        expect(parseLocation('gid=0', gids)).toBeUndefined();
        expect(parseLocation('что-то', gids)).toBeUndefined();
    });
});

describe('readInternalLinks', () => {
    let dir: string;
    let file: string;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'internal-links-'));
        file = join(dir, 'book.xlsx');
        const zip = new JSZip();
        zip.file(
            'xl/workbook.xml',
            '<workbook xmlns:r="r"><sheets><sheet name="СПО" sheetId="1" r:id="rId1"/><sheet name="Прочее" sheetId="2" r:id="rId2"/></sheets></workbook>',
        );
        zip.file(
            'xl/_rels/workbook.xml.rels',
            '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
        );
        zip.file(
            'xl/worksheets/sheet1.xml',
            `<worksheet><hyperlinks>
              <hyperlink ref="V7" location="'МБ СПО'!3:3" display="МБ СПО"/>
              <hyperlink ref="F7" location="gid=1816278612&amp;range=2:2"/>
              <hyperlink ref="U7" r:id="rId1"/>
              <hyperlink ref="W7" r:id="rId2" location="gid=0"/>
            </hyperlinks></worksheet>`,
        );
        zip.file(
            'xl/worksheets/sheet2.xml',
            `<worksheet><hyperlinks><hyperlink ref="A1" location="СПО!5:5"/></hyperlinks></worksheet>`,
        );
        await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('reads internal links of the requested sheets only', async () => {
        const links = await readInternalLinks(file, new Set(['СПО']), {
            '1816278612': 'МБ квалификация',
        });
        expect(links).toEqual([
            { sheet: 'СПО', column: 'V', row: 7, targetSheet: 'МБ СПО', targetRow: 3 },
            { sheet: 'СПО', column: 'F', row: 7, targetSheet: 'МБ квалификация', targetRow: 2 },
        ]);
    });
});
