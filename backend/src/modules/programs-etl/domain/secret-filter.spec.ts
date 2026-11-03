import { describe, expect, it } from 'vitest';
import { SecretFilter } from './secret-filter';

describe('SecretFilter', () => {
    it('removes credential and payment columns before storage', () => {
        const result = new SecretFilter().sanitize({
            headers: ['Программа', 'Логин', 'Ссылка на оплату'],
            rows: [{ rowNo: 7, cells: ['Сестринское дело', 'private', 'https://pay.test/x'] }],
        });
        expect(result.sheet.rows).toEqual([{ rowNo: 7, cells: ['Сестринское дело'] }]);
        expect(result.excludedColumns).toBe(2);
        expect(JSON.stringify(result)).not.toContain('private');
    });

    it('removes secret URLs even under a neutral heading', () => {
        const result = new SecretFilter().sanitize({
            headers: ['Материал'],
            rows: [{ rowNo: 3, cells: ['https://example.test/doc?token=private'] }],
        });
        expect(result.sheet.rows[0].cells).toEqual(['']);
        expect(result.excludedCells).toBe(1);
    });

    it('retains safe links and original row numbers', () => {
        const result = new SecretFilter().sanitize({
            headers: ['Материал'],
            rows: [{ rowNo: 91, cells: ['https://example.test/doc'] }],
        });
        expect(result.sheet.rows[0]).toEqual({ rowNo: 91, cells: ['https://example.test/doc'] });
    });
});
