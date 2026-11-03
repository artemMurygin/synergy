import { describe, expect, it } from 'vitest';
import {
    createSheetIdentity,
    createSheetMap,
    createSanitizedSheet,
    createParsedSheet,
    createProgramNaturalKey,
    createPriceCell,
    createChunkDraft,
} from './value-objects';

describe('ETL value objects', () => {
    it('validates immutable sheet identity', () => {
        const identity = createSheetIdentity('spreadsheet', 17);
        expect(identity).toEqual({ spreadsheetId: 'spreadsheet', sheetId: 17 });
        expect(Object.isFrozen(identity)).toBe(true);
        expect(() => createSheetIdentity('', -1)).toThrow();
    });

    it('validates map columns and catalog literals', () => {
        const map = createSheetMap(
            {
                type: 'programs',
                columns: [
                    { index: 1, role: 'offer', studyForm: 'full_time', baseEducation: 'grade9' },
                ],
            },
            3,
        );
        expect(Object.isFrozen(map)).toBe(true);
        expect(() =>
            createSheetMap({ type: 'programs', columns: [{ index: 4, role: 'title' }] }, 3),
        ).toThrow();
        expect(() =>
            createSheetMap(
                {
                    type: 'programs',
                    columns: [
                        { index: 1, role: 'offer', studyForm: 'fantasy', baseEducation: 'grade9' },
                    ],
                },
                3,
            ),
        ).toThrow();
    });

    it('retains source row numbers in sanitized and parsed sheets', () => {
        const sheet = createSanitizedSheet([{ rowNo: 8, cells: ['Medicine'] }]);
        const parsed = createParsedSheet({ programs: [], warnings: [], sourceRows: [8] });
        expect(sheet.rows[0].rowNo).toBe(8);
        expect(parsed.sourceRows).toEqual([8]);
        expect(Object.isFrozen(sheet.rows[0].cells)).toBe(true);
    });

    it('identifies coded and uncoded programs separately', () => {
        const coded = createProgramNaturalKey({
            organizationId: 'org',
            level: 'spo',
            title: 'Name',
            directionCode: '34.02.01',
        });
        const uncoded = createProgramNaturalKey({
            organizationId: 'org',
            level: 'spo',
            title: 'Name',
        });
        expect(coded.kind).toBe('coded');
        expect(uncoded.kind).toBe('title');
        expect(() =>
            createProgramNaturalKey({ organizationId: 'org', level: 'invalid', title: 'Name' }),
        ).toThrow();
    });

    it('validates exact money and chunk metadata', () => {
        expect(
            createPriceCell({
                amounts: [400000, 345000],
                durationMonths: 34,
                currency: 'RUB',
                sourceText: '400 000 / 345 000 2 г 10 мес',
            }).amounts,
        ).toEqual([400000, 345000]);
        expect(() =>
            createPriceCell({ amounts: [-1], currency: 'RUB', sourceText: '-1' }),
        ).toThrow();
        const chunk = createChunkDraft({
            programKey: 'key',
            sectionType: 'about',
            chunkNo: 0,
            text: 'Text',
            sourceRowNo: 8,
        });
        expect(Object.isFrozen(chunk)).toBe(true);
        expect(() =>
            createChunkDraft({
                programKey: 'key',
                sectionType: 'bad',
                chunkNo: 0,
                text: 'Text',
                sourceRowNo: 8,
            }),
        ).toThrow();
    });
});
