import { describe, expect, it } from 'vitest';
import { MAX_PRODUCT_DEPARTMENTS, ProductAccess } from './product-access';

describe('ProductAccess', () => {
    it('collapses duplicates keeping first-seen order', () => {
        const access = ProductAccess.of('p1', ['b', 'a', 'b', 'c', 'a']);
        expect(access.productId).toBe('p1');
        expect(access.departmentIds).toEqual(['b', 'a', 'c']);
    });

    it('allows an empty set', () => {
        expect(ProductAccess.of('p1', []).departmentIds).toEqual([]);
    });

    it('exposes the limit', () => {
        expect(MAX_PRODUCT_DEPARTMENTS).toBe(100);
    });
});
