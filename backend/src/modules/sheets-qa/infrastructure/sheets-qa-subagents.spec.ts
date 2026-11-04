import { describe, expect, it } from 'vitest';
import {
    COURSE_SEARCHERS,
    EDUCATION_LEVELS,
    SEARCHERS,
    SHEETS_QA_BOOKS,
} from '../sheets-qa.config';
import { buildSearcherPrompt } from './sheets-qa-subagents';
import { buildSheetsQaSystemPrompt } from './sheets-qa-system-prompt';

describe('course searchers', () => {
    it('read existing books and sheets with layouts', () => {
        for (const searcher of COURSE_SEARCHERS) {
            const book = SHEETS_QA_BOOKS.find((item) => item.id === searcher.book);
            expect(book, searcher.agent).toBeDefined();
            for (const sheet of searcher.sheets) {
                expect(book?.layouts[sheet.trim()], `${searcher.agent}: ${sheet}`).toBeDefined();
            }
        }
    });

    it('have unique agent names', () => {
        const names = SEARCHERS.map((item) => item.agent);
        expect(new Set(names).size).toBe(names.length);
    });

    it('put the four catalog books in the default course branch', () => {
        const defaults = COURSE_SEARCHERS.filter((item) => item.scope === 'default').map(
            (item) => item.agent,
        );
        expect(defaults.sort()).toEqual(
            [
                'academy-searcher',
                'dpo-rb-searcher',
                'mti-dpo-searcher',
                'short-courses-searcher',
            ].sort(),
        );
    });
});

describe('buildSearcherPrompt', () => {
    it('names the book, the sheets and forbids secrets for a course searcher', () => {
        const searcher = COURSE_SEARCHERS.find((item) => item.agent === 'mti-dpo-searcher');
        expect(searcher).toBeDefined();
        if (searcher === undefined) return;
        const prompt = buildSearcherPrompt(searcher);
        expect(prompt).toContain('book = «РЕЕСТР ДПО МТИ»');
        expect(prompt).toContain('«Общий реестр»');
        expect(prompt).toContain('Общий реестр (копия)');
        expect(prompt).toContain('Подводные камни');
        expect(prompt).toContain('search_cells');
        expect(prompt).toContain('Никогда не раскрывай логины, пароли');
    });

    it('keeps the education prompt on one sheet without a book argument', () => {
        const spo = EDUCATION_LEVELS.find((item) => item.agent === 'spo-searcher');
        expect(spo).toBeDefined();
        if (spo === undefined) return;
        const prompt = buildSearcherPrompt(spo);
        expect(prompt).toContain('листе «СПО»');
        expect(prompt).not.toContain('book =');
    });
});

describe('buildSheetsQaSystemPrompt', () => {
    const prompt = buildSheetsQaSystemPrompt('CATALOG', SEARCHERS, [
        { id: 'ЦП', description: 'Ценовая политика' },
        { id: 'РЕЕСТР ДПО МТИ', description: 'Прайс ДПО МТИ' },
    ]);

    it('has the courses section with the routing of the searchers', () => {
        expect(prompt).toContain('КУРСЫ И ДПО');
        expect(prompt).toContain('dpo-rb-searcher');
        expect(prompt).toContain('theatre-searcher');
        expect(prompt).toContain('basta-searcher');
        expect(prompt).toContain('не склеивай');
    });

    it('lists the books and keeps the education searchers apart', () => {
        expect(prompt).toContain('- «РЕЕСТР ДПО МТИ»: Прайс ДПО МТИ');
        expect(prompt).toContain('spo-searcher');
        expect(prompt).toContain('КАТАЛОГ\nCATALOG');
    });
});
