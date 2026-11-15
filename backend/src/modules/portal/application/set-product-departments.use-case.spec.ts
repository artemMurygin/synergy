import { describe, expect, it } from 'vitest';
import { DepartmentNotFoundError, ProductNotFoundError } from '../domain/errors';
import { SetProductDepartmentsUseCase } from './set-product-departments.use-case';
import type { Product } from '../domain/product';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    product: Product;
    useCase: SetProductDepartmentsUseCase;
}

function setup(): Setup {
    const fx = createPortalFixture();
    const product = fx.catalog.addProduct('control-center', 'Control Center');
    fx.departments.departments.set('d1', 'Бухгалтерия');
    fx.departments.departments.set('d2', 'Аудит');
    fx.departments.departments.set('d3', 'Юристы');
    const useCase = new SetProductDepartmentsUseCase(
        fx.productAccess,
        fx.departments,
        fx.transactions,
    );
    return { ...fx, product, useCase };
}

describe('SetProductDepartmentsUseCase', () => {
    it('заменяет набор целиком под lockProduct; отделы по названию', async () => {
        const { useCase, product, productAccess } = setup();

        const view = await useCase.execute({ productId: product.id, departmentIds: ['d1', 'd2'] });

        expect(productAccess.lockedIds).toEqual([product.id]);
        expect(view.departments).toEqual([
            { id: 'd2', name: 'Аудит' },
            { id: 'd1', name: 'Бухгалтерия' },
        ]);

        const next = await useCase.execute({ productId: product.id, departmentIds: ['d3'] });
        expect(next.departments).toEqual([{ id: 'd3', name: 'Юристы' }]);
    });

    it('пустой список очищает набор', async () => {
        const { useCase, product } = setup();
        await useCase.execute({ productId: product.id, departmentIds: ['d1'] });

        const view = await useCase.execute({ productId: product.id, departmentIds: [] });

        expect(view.departments).toEqual([]);
    });

    it('повторы схлопываются', async () => {
        const { useCase, product, productAccess } = setup();

        const view = await useCase.execute({
            productId: product.id,
            departmentIds: ['d1', 'd1', 'd2', 'd1'],
        });

        expect(view.departments).toHaveLength(2);
        expect(productAccess.replaced[0]?.departmentIds).toEqual(['d1', 'd2']);
    });

    it('продукта нет: ProductNotFoundError без replace', async () => {
        const { useCase, productAccess } = setup();
        await expect(
            useCase.execute({ productId: 'nope', departmentIds: ['d1'] }),
        ).rejects.toBeInstanceOf(ProductNotFoundError);
        expect(productAccess.replaced).toHaveLength(0);
    });

    it('часть отделов не найдена: DepartmentNotFoundError без replace, набор не меняется', async () => {
        const { useCase, product, productAccess } = setup();
        await useCase.execute({ productId: product.id, departmentIds: ['d1'] });
        productAccess.replaced.length = 0;

        await expect(
            useCase.execute({ productId: product.id, departmentIds: ['d2', 'ghost'] }),
        ).rejects.toMatchObject({ departmentId: 'ghost' });
        await expect(
            useCase.execute({ productId: product.id, departmentIds: ['ghost'] }),
        ).rejects.toBeInstanceOf(DepartmentNotFoundError);

        expect(productAccess.replaced).toHaveLength(0);
        expect(productAccess.access.get(product.id)).toEqual(['d1']);
    });
});
