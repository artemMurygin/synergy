export class CatalogDomainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CatalogDomainError';
    }
}
