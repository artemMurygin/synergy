import { z } from 'zod';

const requestIdsSchema = z.object({ requestId: z.string(), correlationId: z.string() });

export const auditJobDataSchema = z.object({
    dealId: z.string().trim().min(1),
    requestIds: requestIdsSchema.optional(),
});

export const notificationJobDataSchema = z.object({
    username: z.string().trim().min(1),
    message: z.string().trim().min(1),
    requestIds: requestIdsSchema.optional(),
});

export type AuditJobData = z.input<typeof auditJobDataSchema>;
export type NotificationJobData = z.input<typeof notificationJobDataSchema>;
