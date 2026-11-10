import { z } from 'zod';

export const updateTelegramLinkRequestSchema = z.strictObject({
    notificationsEnabled: z.boolean(),
});
export type UpdateTelegramLinkRequest = z.infer<typeof updateTelegramLinkRequestSchema>;
