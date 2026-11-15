import { describe, expect, it } from 'vitest';
import { CatalogName } from './catalog-name';
import { Product } from './product';

describe('Product.create', () => {
    it('builds a product from id, slug and catalog name', () => {
        const product = Product.create({
            id: 'p-1',
            slug: 'bukhgalteriya',
            name: CatalogName.of('  Бухгалтерия '),
        });
        expect(product).toEqual({ id: 'p-1', slug: 'bukhgalteriya', name: 'Бухгалтерия' });
    });
});
