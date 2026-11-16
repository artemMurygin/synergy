import { z } from 'zod';
import { MAX_PRODUCT_DEPARTMENTS } from '../../domain/product-access';

/** Id отдела — текст, не UUID. */
export const setProductDepartmentsSchema = z.object({
    departmentIds: z.array(z.string().trim().min(1).max(100)).max(MAX_PRODUCT_DEPARTMENTS),
});
export type SetProductDepartmentsBody = z.infer<typeof setProductDepartmentsSchema>;
