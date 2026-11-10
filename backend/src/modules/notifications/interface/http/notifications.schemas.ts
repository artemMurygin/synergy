import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
    unreadOnly: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
});
export type ListNotificationsQueryRequest = z.infer<typeof listNotificationsQuerySchema>;
