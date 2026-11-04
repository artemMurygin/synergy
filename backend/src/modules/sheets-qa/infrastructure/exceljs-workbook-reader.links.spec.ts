import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workbook, type Worksheet } from 'exceljs';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LinkRelationRule } from '../sheets-qa.config';
import { ExcelJsWorkbookReader } from './exceljs-workbook-reader';

const NOTE = 'link target has a different name; verify';

describe('ExcelJsWorkbookReader links of the price sheets', () => {
    let dir: string;
    let reader: ExcelJsWorkbookReader;
    let counter = 0;

    const put = (ws: Worksheet, row: number, cells: Record<string, string>): void => {
        for (const [column, value] of Object.entries(cells))
            ws.getCell(`${column}${String(row)}`).value = value;
    };

    /** Writes the workbook, then adds the internal hyperlinks to the XML of the sheets. */
    const build = async (
        links: Record<string, string>,
        rules: readonly LinkRelationRule[],
    ): Promise<ExcelJsWorkbookReader> => {
        const wb = new Workbook();
        const price = wb.addWorksheet('Прайс');
        put(price, 1, { C: 'Направление', D: 'Профиль' });
        put(price, 5, { C: 'Менеджмент', D: 'Стратегическое управление' });
        put(price, 6, { C: 'Дизайн', D: 'Графический дизайн' });
        put(price, 7, { C: 'Финансы', D: '-' });
        put(price, 8, { C: 'Дизайн', D: 'Интерьер' });
        put(price, 9, { C: 'Экономика', D: '' });
        const base = wb.addWorksheet('МБ');
        put(base, 1, { B: 'Название' });
        put(base, 2, { B: 'Менеджмент Профиль: Стратегическое управление организацией' });
        put(base, 3, { B: 'Менеджмент Профиль: Управление проектами' });
        put(base, 4, { B: 'Финансы' });
        put(base, 5, { B: 'Экономика Профиль: Корпоративная экономика' });
        wb.addWorksheet('Другой');
        counter += 1;
        const file = join(dir, `book-${String(counter)}.xlsx`);
        await wb.xlsx.writeFile(file);

        const zip = await JSZip.loadAsync(await readFile(file));
        const xml = (await zip.file('xl/worksheets/sheet1.xml')?.async('string')) ?? '';
        const tags = Object.entries(links)
            .map(([ref, location]) => `<hyperlink ref="${ref}" location="${location}"/>`)
            .join('');
        zip.file(
            'xl/worksheets/sheet1.xml',
            xml.replace('</worksheet>', `<hyperlinks>${tags}</hyperlinks></worksheet>`),
        );
        // a back link in the base: it must not be used
        const baseXml = (await zip.file('xl/worksheets/sheet2.xml')?.async('string')) ?? '';
        zip.file(
            'xl/worksheets/sheet2.xml',
            baseXml.replace(
                '</worksheet>',
                `<hyperlinks><hyperlink ref="A2" location="'Прайс'!9:9"/></hyperlinks></worksheet>`,
            ),
        );
        await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
        return new ExcelJsWorkbookReader({
            file,
            layouts: {},
            overrides: {},
            linkRules: rules,
            gids: {},
            limits: { maxRowsPerRead: 5, maxSearchHits: 5, maxCellChars: 80 },
        });
    };

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'sheets-qa-links-'));
        reader = await build(
            {
                M5: 'null!2:2',
                M6: "'МБ'!3:3",
                M7: "'МБ'!4:4",
                M8: "'МБ'!5:5",
                M9: "'Другой'!2:2",
                N6: "'МБ'!3:3",
            },
            [
                {
                    sheet: 'Прайс',
                    column: 'M',
                    relation: 'methodical_base',
                    targetSheet: 'МБ',
                    rows: [[5, 7]],
                    title: { source: ['C', 'D'], target: ['B'] },
                },
                { sheet: 'Прайс', column: 'N', relation: 'methodical_base', targetSheet: 'МБ' },
            ],
        );
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('takes the target sheet of the rule when the link has lost the name of the sheet', async () => {
        expect(await reader.findRelated('Прайс', 5)).toEqual([
            { sheet: 'МБ', row: 2, relation: 'methodical_base' },
        ]);
    });

    it('limits a rule to the rows of its block', async () => {
        // M8 is a valid link of the right sheet, but outside rows 5-7
        expect(await reader.findRelated('Прайс', 8)).toEqual([]);
    });

    it('ignores a link that leads to a sheet other than the one of the rule', async () => {
        expect(await reader.findRelated('Прайс', 9)).toEqual([]);
    });

    it('accepts a link whose target has the same program, even if the base names more', async () => {
        expect(await reader.findRelated('Прайс', 7)).toEqual([
            { sheet: 'МБ', row: 4, relation: 'methodical_base' },
        ]);
    });

    it('keeps a link to a program with a different name, but asks to verify it', async () => {
        const checked = await build({ M6: "'МБ'!3:3" }, [
            {
                sheet: 'Прайс',
                column: 'M',
                relation: 'methodical_base',
                targetSheet: 'МБ',
                title: { source: ['C', 'D'], target: ['B'] },
            },
        ]);
        expect(await checked.findRelated('Прайс', 6)).toEqual([
            { sheet: 'МБ', row: 3, relation: 'methodical_base', note: NOTE },
        ]);
        expect(await checked.findRelated('МБ', 3)).toEqual([
            { sheet: 'Прайс', row: 6, relation: 'price_row', note: NOTE },
        ]);
    });

    it('drops the note when another column leads to the same row without doubts', async () => {
        // M6 is flagged by the title check, N6 has no check and confirms the link
        expect(await reader.findRelated('Прайс', 6)).toEqual([
            { sheet: 'МБ', row: 3, relation: 'methodical_base' },
        ]);
        expect(await reader.findRelated('МБ', 3)).toEqual([
            { sheet: 'Прайс', row: 6, relation: 'price_row' },
        ]);
    });

    it('finds the price rows of a base row from the links of the price, not from its own links', async () => {
        expect(await reader.findRelated('МБ', 2)).toEqual([
            { sheet: 'Прайс', row: 5, relation: 'price_row' },
        ]);
        // the back link A2 of the base leads to the price row 9, and is not read
        expect(await reader.findRelated('Прайс', 9)).toEqual([]);
    });

    it('does not judge a link when a title is empty', async () => {
        const noTitle = await build({ M9: "'МБ'!5:5" }, [
            {
                sheet: 'Прайс',
                column: 'M',
                relation: 'methodical_base',
                targetSheet: 'МБ',
                title: { source: ['D'], target: ['B'] },
            },
        ]);
        // D9 is empty
        expect(await noTitle.findRelated('Прайс', 9)).toEqual([
            { sheet: 'МБ', row: 5, relation: 'methodical_base' },
        ]);
    });
});
