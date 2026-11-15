import type { CatalogName } from './catalog-name';

/** Продукт каталога. */
export interface Product {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
}

export interface CreateProductInput {
    id: string;
    slug: string;
    name: CatalogName;
}

export const Product = {
    create(input: CreateProductInput): Product {
        return { id: input.id, slug: input.slug, name: input.name.value };
    },
} as const;
