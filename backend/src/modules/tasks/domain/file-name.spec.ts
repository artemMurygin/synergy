import { describe, expect, it } from 'vitest';
import { FileName, InvalidFileNameError, MAX_FILE_NAME_LENGTH } from './file-name';

describe('FileName', () => {
    it('keeps an ordinary name', () => {
        expect(FileName.of('Отчёт 2026.pdf').value).toBe('Отчёт 2026.pdf');
    });

    it('strips path segments from a traversal attempt', () => {
        expect(FileName.of('../../etc/passwd').value).toBe('passwd');
        expect(FileName.of('C:\\Users\\ivan\\secret.txt').value).toBe('secret.txt');
        expect(FileName.of('/abs/path/file.txt').value).toBe('file.txt');
    });

    it('removes control characters', () => {
        expect(FileName.of('re\u0000po\u001frt\u007f.txt').value).toBe('report.txt');
        expect(FileName.of('a\r\nb.txt').value).toBe('ab.txt');
    });

    it('trims whitespace', () => {
        expect(FileName.of('  a.txt  ').value).toBe('a.txt');
    });

    it('cuts the name to 255 characters keeping the extension', () => {
        const name = FileName.of(`${'a'.repeat(300)}.pdf`).value;
        expect(name).toHaveLength(MAX_FILE_NAME_LENGTH);
        expect(name.endsWith('.pdf')).toBe(true);
    });

    it('cuts a long name without extension', () => {
        expect(FileName.of('b'.repeat(400)).value).toHaveLength(MAX_FILE_NAME_LENGTH);
    });

    it('rejects a name that is empty after sanitising', () => {
        expect(() => FileName.of('')).toThrow(InvalidFileNameError);
        expect(() => FileName.of('\u0000\u0001')).toThrow(InvalidFileNameError);
        expect(() => FileName.of('../')).toThrow(InvalidFileNameError);
        expect(() => FileName.of('..')).toThrow(InvalidFileNameError);
        expect(() => FileName.of('   ')).toThrow(InvalidFileNameError);
    });
});
