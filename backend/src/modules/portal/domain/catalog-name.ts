import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_CATALOG_NAME_LENGTH = 100;

/** Название агента или продукта: обрезанное, 1-100 символов. */
export class CatalogName {
    private constructor(readonly value: string) {}

    static of(raw: string): CatalogName {
        const value = raw.trim();
        if (value.length === 0) {
            throw new ArgumentInvalidError('Catalog name must not be empty');
        }
        if (value.length > MAX_CATALOG_NAME_LENGTH) {
            throw new ArgumentInvalidError(
                `Catalog name is longer than ${String(MAX_CATALOG_NAME_LENGTH)} characters`,
            );
        }
        return new CatalogName(value);
    }

    /** Ключ сравнения на уникальность: lower(trim). */
    get key(): string {
        return this.value.toLowerCase();
    }
}
