import { describe, expect, it } from 'vitest';
import type { SheetGuidesPort } from '../domain/ports/sheet-guides.port';
import { WorkbookError, type WorkbookReaderPort } from '../domain/ports/workbook-reader.port';
import { BookRegistry, type BookEntry } from './book-registry';

function entry(id: string): BookEntry {
    return {
        id,
        description: `book ${id}`,
        reader: {} as WorkbookReaderPort,
        guides: {} as SheetGuidesPort,
    };
}

describe('BookRegistry', () => {
    const main = entry('ЦП');
    const other = entry('ДПО для РБ');
    const registry = new BookRegistry([main, other], 'ЦП');

    it('returns the default book when no id is given', () => {
        expect(registry.get()).toBe(main);
        expect(registry.get('ДПО для РБ')).toBe(other);
    });

    it('lists the books with their descriptions only', () => {
        expect(registry.list()).toEqual([
            { id: 'ЦП', description: 'book ЦП' },
            { id: 'ДПО для РБ', description: 'book ДПО для РБ' },
        ]);
    });

    it('throws a WorkbookError with the available books for an unknown id', () => {
        expect(() => registry.get('нет')).toThrow(WorkbookError);
        expect(() => registry.get('нет')).toThrow('Available books: ЦП, ДПО для РБ');
    });

    it('rejects a default book that is not registered', () => {
        expect(() => new BookRegistry([main], 'нет')).toThrow('not registered');
    });
});
