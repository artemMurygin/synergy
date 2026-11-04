import { CatalogDomainError } from '../errors/catalog-domain.error';

export function requireNonBlank(name: string, value: string): string {
    if (value.trim() === '') {
        throw new CatalogDomainError(`${name} must not be blank`);
    }
    return value;
}

export function requireOptionalPositiveInt(
    name: string,
    value: number | null | undefined,
): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value) || value <= 0) {
        throw new CatalogDomainError(`${name} must be a positive integer: ${String(value)}`);
    }
    return value;
}
