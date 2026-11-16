export const MAX_PRODUCT_DEPARTMENTS = 100;

/** Справочная пометка: отделы, которым доступен продукт. Набор заменяется целиком. */
export class ProductAccess {
    private constructor(
        readonly productId: string,
        readonly departmentIds: readonly string[],
    ) {}

    /** Повторы схлопываются, порядок первого появления сохраняется. */
    static of(productId: string, departmentIds: readonly string[]): ProductAccess {
        return new ProductAccess(productId, [...new Set(departmentIds)]);
    }
}
