import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workbook } from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExcelJsWorkbookReader } from './exceljs-workbook-reader';

describe('ExcelJsWorkbookReader hidden cells', () => {
    let dir: string;
    let reader: ExcelJsWorkbookReader;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'sheets-qa-hidden-'));
        const file = join(dir, 'book.xlsx');
        const wb = new Workbook();
        const ws = wb.addWorksheet('Курсы');
        ws.getCell('A1').value = 'Название';
        ws.getCell('B1').value = 'Контакт';
        ws.getCell('A2').value = 'Python курс';
        ws.getCell('B2').value = {
            text: 'логин: demo@example.com пароль: s3cret',
            hyperlink: 'https://t.me/secret-chat',
        };
        ws.getCell('A3').value = 'Java курс';
        ws.getCell('B3').value = {
            text: 'логин: demo@example.com пароль: open',
            hyperlink: 'https://t.me/open-chat',
        };
        ws.getCell('A4').value = 'Закрытый раздел';
        ws.mergeCells('A4:B4');
        ws.getCell('A5').value = 'Go курс';
        ws.getCell('B5').value = 'пароль: 5';
        ws.getCell('C6').value = 'пароль: колонка';
        await wb.xlsx.writeFile(file);
        reader = new ExcelJsWorkbookReader({
            file,
            layouts: {
                Курсы: {
                    headerRows: [1],
                    firstDataRow: 2,
                    hiddenColumns: ['C'],
                    hiddenCells: [
                        { column: 'B', rows: [[2, 2]] },
                        { column: 'A', rows: [[4, 4]] },
                    ],
                },
            },
            overrides: {},
            linkRules: [],
            gids: {},
            limits: { maxRowsPerRead: 10, maxSearchHits: 20, maxCellChars: 100 },
        });
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('does not find a hidden cell but finds the same text elsewhere', async () => {
        const { hits } = await reader.searchCells(['пароль']);
        expect(hits.map((hit) => `${hit.column}${String(hit.row)}`).sort()).toEqual(['B3', 'B5']);
        const named = await reader.searchCells(['закрытый']);
        expect(named.hits).toHaveLength(0);
        const mail = await reader.searchCells(['demo@example.com'], 'Курсы');
        expect(mail.hits.map((hit) => hit.row)).toEqual([3]);
    });

    it('omits the value and the link of a hidden cell from read_rows', async () => {
        const page = await reader.readRows('Курсы', 1, 6);
        const columnsOf = (row: number): string[] =>
            page.rows.find((item) => item.row === row)?.cells.map((cell) => cell.column) ?? [];
        expect(columnsOf(2)).toEqual(['A']);
        expect(columnsOf(3)).toEqual(['A', 'B']);
        expect(columnsOf(6)).toEqual([]);
        const links = page.rows.flatMap((item) => item.cells.map((cell) => cell.link));
        expect(links).not.toContain('https://t.me/secret-chat');
        expect(links).toContain('https://t.me/open-chat');
    });

    it('does not use a hidden merged cell as the section of the rows below', async () => {
        const page = await reader.readRows('Курсы', 5, 5);
        expect(page.rows[0]?.section).toBeUndefined();
    });

    it('omits hidden cells from get_row_links', async () => {
        expect(await reader.getRowLinks('Курсы', 2)).toEqual([]);
        expect((await reader.getRowLinks('Курсы', 3)).map((link) => link.url)).toEqual([
            'https://t.me/open-chat',
        ]);
    });
});
