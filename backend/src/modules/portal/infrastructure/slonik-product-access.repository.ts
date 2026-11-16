import { Injectable } from '@nestjs/common';
import { ForeignKeyIntegrityConstraintViolationError, sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DepartmentNotFoundError } from '../domain/errors';
import type { Product } from '../domain/product';
import type { ProductAccess } from '../domain/product-access';
import {
    ProductAccessRepository,
    type ProductAccessView,
} from '../domain/ports/product-access-repository.port';
import { UUID_PATTERN } from './sql-helpers';

const productRow = z.object({ id: z.string(), slug: z.string(), name: z.string() });
const departmentRow = z.object({ id: z.string(), name: z.string() });

@Injectable()
export class SlonikProductAccessRepository extends ProductAccessRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async lockProduct(id: string): Promise<Product | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, slug, name FROM portal_products WHERE id = ${id} FOR UPDATE`);
        return row === null ? null : productRow.parse(row);
    }

    async replace(access: ProductAccess): Promise<void> {
        const executor = this.transactions.executor();
        await executor.query(sql.unsafe`
            DELETE FROM portal_product_departments WHERE product_id = ${access.productId}`);
        if (access.departmentIds.length === 0) return;
        try {
            await executor.query(sql.unsafe`
                INSERT INTO portal_product_departments (product_id, department_id)
                SELECT ${access.productId}, d
                  FROM unnest(${sql.array([...access.departmentIds], 'text')}) AS d`);
        } catch (error) {
            if (error instanceof ForeignKeyIntegrityConstraintViolationError) {
                throw new DepartmentNotFoundError(extractDepartmentId(error, access));
            }
            throw error;
        }
    }

    async findProductWithDepartments(id: string): Promise<ProductAccessView | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const executor = this.transactions.executor();
        const product = await executor.maybeOne(sql.unsafe`
            SELECT id, slug, name FROM portal_products WHERE id = ${id}`);
        if (product === null) return null;
        const departments = await executor.any(sql.unsafe`
            SELECT d.id, d.name
              FROM portal_product_departments pd
              JOIN auth_departments d ON d.id = pd.department_id
             WHERE pd.product_id = ${id}
             ORDER BY lower(d.name), d.id`);
        return {
            ...productRow.parse(product),
            departments: departments.map((row) => departmentRow.parse(row)),
        };
    }
}

/** Из `Key (department_id)=(x) is not present` достаём id; иначе — первый из набора. */
function extractDepartmentId(
    error: ForeignKeyIntegrityConstraintViolationError,
    access: ProductAccess,
): string {
    const detail = (error.cause as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') {
        const match = /\(department_id\)=\((.*)\) is not present/.exec(detail);
        if (match?.[1] !== undefined) return match[1];
    }
    return access.departmentIds[0] ?? '';
}
