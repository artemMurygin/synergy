import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DepartmentNotFoundError, ProductNotFoundError } from '../domain/errors';
import { DepartmentLookupPort } from '../domain/ports/department-lookup.port';
import {
    ProductAccessRepository,
    type ProductAccessView,
} from '../domain/ports/product-access-repository.port';
import { ProductAccess } from '../domain/product-access';

export interface SetProductDepartmentsInput {
    productId: string;
    departmentIds: readonly string[];
}

/** Замена набора отделов продукта целиком; продукт блокируется `FOR UPDATE`. */
@Injectable()
export class SetProductDepartmentsUseCase {
    constructor(
        private readonly access: ProductAccessRepository,
        private readonly departments: DepartmentLookupPort,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    execute(input: SetProductDepartmentsInput): Promise<ProductAccessView> {
        return this.transactions.run(async () => {
            const product = await this.access.lockProduct(input.productId);
            if (product === null) throw new ProductNotFoundError(input.productId);

            const access = ProductAccess.of(product.id, input.departmentIds);
            const existing = new Set(await this.departments.findExistingIds(access.departmentIds));
            const missing = access.departmentIds.find((id) => !existing.has(id));
            if (missing !== undefined) throw new DepartmentNotFoundError(missing);

            await this.access.replace(access);
            const view = await this.access.findProductWithDepartments(product.id);
            if (view === null) throw new ProductNotFoundError(product.id);
            return view;
        });
    }
}
