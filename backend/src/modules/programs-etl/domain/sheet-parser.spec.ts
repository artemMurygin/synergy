import { describe, expect, it } from 'vitest';
import { createSanitizedSheet } from './value-objects';
import { parsePriceCell, SheetParser, type ParserSheetMap } from './sheet-parser';

const wideMap: ParserSheetMap = {
    type: 'programs',
    organization: { kind: 'university', name: 'Университет Синергия' },
    level: 'spo',
    columns: [
        { index: 0, role: 'title' },
        { index: 1, role: 'qualification' },
        { index: 2, role: 'offer', studyForm: 'full_time', baseEducation: 'grade9' },
        { index: 3, role: 'offer', studyForm: 'distance', baseEducation: 'grade11' },
        { index: 4, role: 'text', sectionType: 'careers' },
    ],
    headingRows: [
        { rowNo: 3, faculty: 'Медицинский факультет', city: 'Москва', metro: 'Нагатинская' },
    ],
};

describe('parsePriceCell', () => {
    it('separates first and following year sums from duration in a documented SPO cell', () => {
        const price = parsePriceCell('400 000/\n345 000\n2 г 10 мес');
        expect(price.amounts).toEqual([400000, 345000]);
        expect(price.durationMonths).toBe(34);
        expect(price.currency).toBe('RUB');
    });

    it('reads spaced DPO sums, single ruble sum and hours without treating duration as money', () => {
        expect(parsePriceCell('189 000 / 75 600').amounts).toEqual([189000, 75600]);
        expect(parsePriceCell('228 900 ₽').amounts).toEqual([228900]);
        expect(parsePriceCell('7 500 ₽, 72 часа').amounts).toEqual([7500]);
        expect(parsePriceCell('210 000/ 175 000 3 г 10 мес').durationMonths).toBe(46);
    });

    it('does not mistake a start date or hours for a second amount', () => {
        expect(parsePriceCell('7 500 ₽, 72 часа, старт 01.09.2026').amounts).toEqual([7500]);
    });

    it('rejects a price cell without a verifiable sum', () => {
        expect(() => parsePriceCell('цена по запросу')).toThrow();
    });
});

describe('SheetParser', () => {
    it('expands wide columns into offers and carries faculty and location from a heading row', () => {
        const parsed = new SheetParser().parse(
            createSanitizedSheet([
                { rowNo: 3, cells: ['МЕДИЦИНСКИЙ ФАКУЛЬТЕТ м. Нагатинская'] },
                {
                    rowNo: 4,
                    cells: [
                        'Сестринское дело 34.02.01',
                        'Медицинская сестра',
                        '400 000/\n345 000\n2 г 10 мес',
                        '228 900 ₽',
                        'Выпускники работают в клиниках.',
                    ],
                },
            ]),
            wideMap,
        );

        expect(parsed.warnings).toEqual([]);
        expect(parsed.sourceRows).toEqual([4]);
        expect(parsed.programs).toHaveLength(1);
        const program = parsed.programs[0];
        expect(program).toMatchObject({
            title: 'Сестринское дело',
            directionCode: '34.02.01',
            qualification: 'Медицинская сестра',
            faculty: 'Медицинский факультет',
            location: { city: 'Москва', metro: 'Нагатинская' },
            sourceRowNo: 4,
        });
        expect(program.offers).toEqual([
            expect.objectContaining({
                studyForm: 'full_time',
                baseEducation: 'grade9',
                durationMonths: 34,
                prices: [
                    { kind: 'first_year', amount: 400000, currency: 'RUB' },
                    { kind: 'next_year', amount: 345000, currency: 'RUB' },
                ],
            }),
            expect.objectContaining({
                studyForm: 'distance',
                baseEducation: 'grade11',
                prices: [{ kind: 'first_year', amount: 228900, currency: 'RUB' }],
            }),
        ]);
        expect(program.sections).toEqual([
            { sectionType: 'careers', text: 'Выпускники работают в клиниках.', sourceRowNo: 4 },
        ]);
    });

    it('keeps uncoded flat programs separate and reads hours', () => {
        const map: ParserSheetMap = {
            type: 'programs',
            organization: { kind: 'university', name: 'Университет Синергия' },
            level: 'short_course',
            columns: [
                { index: 0, role: 'title' },
                { index: 1, role: 'hours' },
                { index: 2, role: 'offer', studyForm: 'online', baseEducation: 'any' },
                { index: 3, role: 'text', sectionType: 'course_goal' },
            ],
        };
        const parsed = new SheetParser().parse(
            createSanitizedSheet([
                {
                    rowNo: 2,
                    cells: [
                        'Курс по коммуникации',
                        '72 часа',
                        '7 500 ₽',
                        'Цель и содержание курса.',
                    ],
                },
            ]),
            map,
        );
        expect(parsed.programs[0].directionCode).toBeNull();
        expect(parsed.programs[0].offers[0].hours).toBe(72);
        expect(parsed.programs[0].sections[0].text).toBe('Цель и содержание курса.');
    });

    it('warns and omits a malformed price row rather than inventing a price', () => {
        const parsed = new SheetParser().parse(
            createSanitizedSheet([
                { rowNo: 9, cells: ['Сестринское дело', '', 'цена по запросу', '', ''] },
            ]),
            wideMap,
        );
        expect(parsed.programs).toEqual([]);
        expect(parsed.warnings).toEqual([{ rowNo: 9, code: 'UNPARSEABLE_PRICE' }]);
    });

    it('uses mapped price kinds and retains requirements and source rows', () => {
        const map: ParserSheetMap = {
            ...wideMap,
            columns: [
                { index: 0, role: 'title' },
                {
                    index: 1,
                    role: 'offer',
                    studyForm: 'online',
                    baseEducation: 'any',
                    priceKinds: ['total'],
                },
                { index: 2, role: 'requirement', baseEducation: 'grade11' },
            ],
        };
        const parsed = new SheetParser().parse(
            createSanitizedSheet([
                { rowNo: 12, cells: ['Курс коммуникации', '7 500 ₽', 'Русский язык'] },
            ]),
            map,
        );
        expect(parsed.offers).toHaveLength(1);
        expect(parsed.prices).toEqual([{ kind: 'total', amount: 7500, currency: 'RUB' }]);
        expect(parsed.requirements).toEqual([
            { baseEducation: 'grade11', subject: 'Русский язык', sourceRowNo: 12 },
        ]);
        expect(parsed.referenceRecords).toEqual([]);
        expect(parsed.sourceRows).toEqual([12]);
    });

    it('rejects a map with invalid catalog literals or unknown columns before parsing', () => {
        const sheet = createSanitizedSheet([{ rowNo: 2, cells: ['Курс', '100 000 ₽'] }]);
        expect(() =>
            new SheetParser().parse(sheet, {
                ...wideMap,
                level: 'wrong' as ParserSheetMap['level'],
            }),
        ).toThrow();
        expect(() =>
            new SheetParser().parse(sheet, { ...wideMap, columns: [{ index: 8, role: 'title' }] }),
        ).toThrow();
    });
});
