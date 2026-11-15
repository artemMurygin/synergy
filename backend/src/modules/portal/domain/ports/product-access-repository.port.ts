import type { ProductAccess } from '../product-access';
import type { Product } from '../product';
import type { DepartmentRef } from './catalog-query.port';

/** Продукт с отделами (по названию отдела). */
export interface ProductAccessView {
    id: string;
    slug: string;
    name: string;
    departments: DepartmentRef[];
}

export abstract class ProductAccessRepository {
    /** `SELECT … FOR UPDATE`: сериализует администраторов. `null` — продукта нет. */
    abstract lockProduct(id: string): Promise<Product | null>;
    /** Заменяет набор целиком; FK 23503 (отдел удалён в гонке) → `DepartmentNotFoundError`. */
    abstract replace(access: ProductAccess): Promise<void>;
    /** Продукт с отделами `ORDER BY lower(name), id`; `null` — продукта нет. */
    abstract findProductWithDepartments(id: string): Promise<ProductAccessView | null>;
}
