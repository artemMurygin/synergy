import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { CatalogName, MAX_CATALOG_NAME_LENGTH } from './catalog-name';

describe('CatalogName', () => {
    it('trims the value', () => {
        expect(CatalogName.of('  Сверка актов ').value).toBe('Сверка актов');
    });

    it('rejects empty and blank values', () => {
        expect(() => CatalogName.of('')).toThrow(ArgumentInvalidError);
        expect(() => CatalogName.of('   ')).toThrow(ArgumentInvalidError);
    });

    it('allows exactly 100 characters and rejects 101', () => {
        expect(MAX_CATALOG_NAME_LENGTH).toBe(100);
        expect(CatalogName.of('a'.repeat(100)).value).toHaveLength(100);
        expect(() => CatalogName.of('a'.repeat(101))).toThrow(ArgumentInvalidError);
    });

    it('key is lower-cased trimmed value', () => {
        expect(CatalogName.of('  Сверка АКТОВ ').key).toBe('сверка актов');
    });
});
