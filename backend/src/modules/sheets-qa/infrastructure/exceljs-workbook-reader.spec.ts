import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workbook, type Worksheet } from 'exceljs';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkbookError } from '../domain/ports/workbook-reader.port';
import { ExcelJsWorkbookReader } from './exceljs-workbook-reader';

describe('ExcelJsWorkbookReader', () => {
    let dir: string;
    let reader: ExcelJsWorkbookReader;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'sheets-qa-'));
        const file = join(dir, 'book.xlsx');
        const wb = new Workbook();

        const put = (ws: Worksheet, row: number, cells: Record<string, string>): void => {
            for (const [column, value] of Object.entries(cells))
                ws.getCell(`${column}${String(row)}`).value = value;
        };

        const spo = wb.addWorksheet('СПО');
        put(spo, 4, {
            B: 'Господдержка',
            C: 'Специальность',
            D: 'Квалификация',
            F: 'Проект',
            H: 'Очная',
        });
        put(spo, 5, { H: '9 кл.' });
        spo.mergeCells('B6:H6');
        put(spo, 6, { B: 'МЕДИЦИНСКИЙ ФАКУЛЬТЕТ\nм. Нагатинская' });
        put(spo, 7, {
            B: '+',
            C: 'Лечебное дело 31.02.01',
            D: 'Фельдшер',
            F: 'Комьюнити',
            H: '400 000/\n345 000\n3 г 10 мес',
        });
        put(spo, 8, { C: 'Фармация 33.02.01', D: 'Фармацевт' });
        spo.getCell('H8').value = {
            text: 'Профессиональное испытание',
            hyperlink: 'https://lms.example/registration',
        };

        const mb = wb.addWorksheet('МБ СПО');
        put(mb, 1, { B: 'Факультет', C: 'Специальность', D: 'О программе' });
        put(mb, 2, {
            B: 'МЕДИЦИНСКИЙ ФАКУЛЬТЕТ м. Нагатинская',
            C: 'Фармация\nФармацевт',
            D: 'Описание фармации',
        });
        put(mb, 3, {
            B: 'МЕДИЦИНСКИЙ ФАКУЛЬТЕТ м. Нагатинская',
            C: 'Лечебное дело\nФельдшер',
            D: 'Описание лечебного дела',
        });

        const kv = wb.addWorksheet('МБ квалификация');
        put(kv, 1, { A: 'Факультет', B: 'Название', C: 'Речь', D: 'Цена', I: 'Секрет' });
        put(kv, 2, {
            A: 'Медицинский факультет',
            B: 'Комьюнити',
            C: 'Речь',
            D: '30 000',
            I: 'Пароль: 123',
        });

        put(wb.addWorksheet('Прочее'), 1, { B: 'Комьюнити в другом листе' });

        await wb.xlsx.writeFile(file);
        reader = new ExcelJsWorkbookReader({
            file,
            layouts: {
                СПО: { headerRows: [4, 5], firstDataRow: 6 },
                'МБ СПО': { headerRows: [1], firstDataRow: 2 },
                'МБ квалификация': { headerRows: [1], firstDataRow: 2, hiddenColumns: ['I'] },
            },
            overrides: {},
            linkRules: [],
            gids: {},
            limits: { maxRowsPerRead: 2, maxSearchHits: 2, maxCellChars: 40 },
        });
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('lists sheets and marks described ones', async () => {
        const sheets = await reader.listSheets();
        expect(sheets.map((s) => [s.name, s.described])).toEqual([
            ['СПО', true],
            ['МБ СПО', true],
            ['МБ квалификация', true],
            ['Прочее', false],
        ]);
    });

    it('reads a row with column labels, its section and links', async () => {
        const page = await reader.readRows('СПО', 7, 8);
        expect(page.columnLabels).toMatchObject({
            B: 'Господдержка',
            C: 'Специальность',
            H: 'Очная / 9 кл.',
        });
        expect(page.rows[0]).toMatchObject({
            row: 7,
            section: 'МЕДИЦИНСКИЙ ФАКУЛЬТЕТ, м. Нагатинская',
        });
        expect(page.rows[0]?.cells.find((c) => c.column === 'H')?.value).toBe(
            '400 000/\n345 000\n3 г 10 мес',
        );
        expect(page.rows[1]?.cells.find((c) => c.column === 'H')?.link).toBe(
            'https://lms.example/registration',
        );
    });

    it('limits the number of rows per read and says so', async () => {
        const page = await reader.readRows('СПО', 5, 9);
        expect(page.truncated).toBe(true);
        expect(page.rows.length).toBeLessThanOrEqual(2);
    });

    it('reads only the requested columns', async () => {
        const page = await reader.readRows('СПО', 7, 7, ['c']);
        expect(page.rows[0]?.cells.map((c) => c.column)).toEqual(['C']);
    });

    it('clips very long cells', async () => {
        const page = await reader.readRows('МБ СПО', 2, 2, ['D']);
        expect(page.rows[0]?.cells[0]?.value.length).toBeLessThanOrEqual(41);
    });

    it('finds cells by all words and limits the hits', async () => {
        const found = await reader.searchCells(['лечебное дело']);
        expect(found.hits.map((h) => [h.sheet, h.row, h.column])).toEqual(
            expect.arrayContaining([['СПО', 7, 'C']]),
        );
        const limited = await reader.searchCells(['комьюнити']);
        expect(limited.hits).toHaveLength(2);
        expect(limited.truncated).toBe(true);
        expect((await reader.searchCells(['комьюнити'], 'Прочее')).hits).toHaveLength(1);
    });

    it('finds cells by any of several queries and tells which ones matched', async () => {
        const found = await reader.searchCells(['лечебное дело', 'zzz-нет-такого', 'лечебн']);
        const hit = found.hits.find((h) => h.sheet === 'СПО' && h.row === 7 && h.column === 'C');
        expect(hit?.queries).toEqual([0, 2]);
    });

    it('never exposes hidden columns', async () => {
        expect((await reader.searchCells(['пароль'])).hits).toEqual([]);
        const page = await reader.readRows('МБ квалификация', 2, 2);
        expect(page.rows[0]?.cells.map((c) => c.column)).not.toContain('I');
    });

    it('returns hyperlinks of a row', async () => {
        expect(await reader.getRowLinks('СПО', 8)).toEqual([
            {
                column: 'H',
                text: 'Профессиональное испытание',
                url: 'https://lms.example/registration',
            },
        ]);
    });

    it('falls back to names and marks the relation as a guess when there is no hyperlink', async () => {
        const note = 'matched by names, no hyperlink; verify';
        expect(await reader.findRelated('СПО', 7)).toEqual(
            expect.arrayContaining([
                { sheet: 'МБ СПО', row: 3, relation: 'methodical_base', note },
                { sheet: 'МБ квалификация', row: 2, relation: 'qualification_project', note },
            ]),
        );
        expect(await reader.findRelated('МБ СПО', 2)).toEqual([
            { sheet: 'СПО', row: 8, relation: 'price_row', note },
        ]);
    });

    it('reports an unknown sheet in a way the model can read', async () => {
        await expect(reader.readRows('Нет такого', 1, 1)).rejects.toBeInstanceOf(WorkbookError);
        await expect(reader.readRows('СПО', 5, 2)).rejects.toBeInstanceOf(WorkbookError);
        await expect(reader.searchCells(['   '])).rejects.toBeInstanceOf(WorkbookError);
    });

    it('follows hyperlinks first and reports the reverse side on the target row', async () => {
        const zip = await JSZip.loadAsync(await readFile(join(dir, 'book.xlsx')));
        const sheetPath = 'xl/worksheets/sheet1.xml';
        const xml = (await zip.file(sheetPath)?.async('string')) ?? '';
        zip.file(
            sheetPath,
            xml.replace(
                '</worksheet>',
                `<hyperlinks><hyperlink ref="V7" location="'МБ СПО'!2:2"/><hyperlink ref="F7" location="'МБ квалификация'!2:2"/></hyperlinks></worksheet>`,
            ),
        );
        const linked = join(dir, 'linked.xlsx');
        await writeFile(linked, await zip.generateAsync({ type: 'nodebuffer' }));
        const withLinks = new ExcelJsWorkbookReader({
            file: linked,
            layouts: {
                СПО: { headerRows: [4, 5], firstDataRow: 6 },
                'МБ СПО': { headerRows: [1], firstDataRow: 2 },
                'МБ квалификация': { headerRows: [1], firstDataRow: 2 },
            },
            overrides: {},
            linkRules: [
                { sheet: 'СПО', column: 'V', relation: 'methodical_base' },
                { sheet: 'СПО', column: 'F', relation: 'qualification_project' },
            ],
            gids: {},
            limits: { maxRowsPerRead: 2, maxSearchHits: 2, maxCellChars: 40 },
        });
        // the link wins over the name match (which would say МБ СПО!3 for «Лечебное дело»)
        expect(await withLinks.findRelated('СПО', 7)).toEqual([
            { sheet: 'МБ СПО', row: 2, relation: 'methodical_base' },
            { sheet: 'МБ квалификация', row: 2, relation: 'qualification_project' },
        ]);
        expect(await withLinks.findRelated('МБ СПО', 2)).toEqual(
            expect.arrayContaining([{ sheet: 'СПО', row: 7, relation: 'price_row' }]),
        );
    });
});
