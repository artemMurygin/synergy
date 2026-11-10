import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { MAX_USER_SEARCH_LENGTH } from '../../domain/user-search';

export const listUsersQuerySchema = paginationQuerySchema.extend({
    search: z.string().max(MAX_USER_SEARCH_LENGTH).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
