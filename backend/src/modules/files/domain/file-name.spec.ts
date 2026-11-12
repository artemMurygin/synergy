import { describe, expect, it } from 'vitest';
import { FileName, InvalidFileNameError, MAX_FILE_NAME_LENGTH } from './file-name';

describe('FileName', () => {
    it('keeps a cyrillic name', () => {
        expect(FileName.of('Отчёт.xlsx').value).toBe('Отчёт.xlsx');
        expect(FileName.of('встреча с клиентом.m4a').value).toBe('встреча с клиентом.m4a');
    });

    it('trims surrounding whitespace', () => {
        expect(FileName.of('  list.csv \t').value).toBe('list.csv');
    });

    it('removes control characters', () => {
        expect(FileName.of('re\u0000po\u001frt\u007f.txt').value).toBe('report.txt');
        expect(FileName.of('a\r\nb.txt').value).toBe('ab.txt');
    });

    it('cuts a long name to 255 characters keeping the extension', () => {
        const name = FileName.of(`${'я'.repeat(300)}.pdf`).value;
        expect(name).toHaveLength(MAX_FILE_NAME_LENGTH);
        expect(name.endsWith('.pdf')).toBe(true);
    });

    it('cuts a long name without extension', () => {
        expect(FileName.of('b'.repeat(400)).value).toHaveLength(MAX_FILE_NAME_LENGTH);
    });

    it.each([[''], ['   '], ['\u0000\u0001'], ['.'], ['..']])('rejects an empty name %j', (raw) => {
        expect(() => FileName.of(raw)).toThrow(InvalidFileNameError);
    });

    it.each([['../../etc/passwd'], ['dir/file.txt'], ['C:\\Users\\secret.txt'], ['/']])(
        'rejects a name with a path separator %j',
        (raw) => {
            expect(() => FileName.of(raw)).toThrow(InvalidFileNameError);
        },
    );

    it('compares by value', () => {
        expect(FileName.of('a.txt').equals(FileName.of(' a.txt'))).toBe(true);
        expect(FileName.of('a.txt').equals(FileName.of('b.txt'))).toBe(false);
    });
});
