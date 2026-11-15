import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { BUG_STATUSES } from '../../domain/bug-status';

// Грубые верхние границы защищают от гигантских тел до trim; смысловые правила — в value object'ах.
const MAX_RAW_TITLE_LENGTH = 1000;
const MAX_RAW_DESCRIPTION_LENGTH = 20000;
const MAX_RAW_REASON_LENGTH = 10000;

export const reportBugSchema = z.object({
    title: z.string().max(MAX_RAW_TITLE_LENGTH),
    description: z.string().max(MAX_RAW_DESCRIPTION_LENGTH),
    // Формат не проверяем: неизвестный/некорректный идентификатор — 404 из use case, а не 400.
    productId: z.string().min(1).max(100),
    agentId: z.string().min(1).max(100),
});
export type ReportBugBody = z.infer<typeof reportBugSchema>;

export const changeBugStatusSchema = z.object({
    status: z.enum(BUG_STATUSES),
    reason: z.string().max(MAX_RAW_REASON_LENGTH).optional(),
});
export type ChangeBugStatusBody = z.infer<typeof changeBugStatusSchema>;

export const bugPageQuerySchema = paginationQuerySchema;
export type BugPageQuery = z.infer<typeof bugPageQuerySchema>;

export const bugQueueQuerySchema = paginationQuerySchema.extend({
    status: z.enum(BUG_STATUSES).optional(),
});
export type BugQueueQuery = z.infer<typeof bugQueueQuerySchema>;
