import { z } from 'zod';

export const createAuditSchema = z.object({
    query: z.string().min(1),
});
export type CreateAuditDto = z.infer<typeof createAuditSchema>;
