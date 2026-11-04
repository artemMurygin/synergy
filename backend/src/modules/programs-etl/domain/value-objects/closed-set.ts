import { CatalogDomainError } from '../errors/catalog-domain.error';

export function parseClosedSet<const T extends readonly string[]>(
    name: string,
    allowed: T,
    value: string,
): T[number] {
    const found = allowed.find((candidate) => candidate === value);
    if (found === undefined) {
        throw new CatalogDomainError(`Unknown ${name}: ${value}`);
    }
    return found;
}
