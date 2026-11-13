import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { MAX_REJECT_REASON_LENGTH } from '../../domain/reject-reason';
import { MAX_REQUEST_TITLE_LENGTH } from '../../domain/request-title';
import { MAX_SKILL_NAME_LENGTH } from '../../domain/skill-name';
import { FREQUENCY_PERIODS } from '../../domain/frequency';

const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_NUMBER = 1_000_000;

const positiveInt = z.number().int().min(1).max(MAX_NUMBER);

export const submitRequestSchema = z.object({
    title: z.string().trim().min(1).max(MAX_REQUEST_TITLE_LENGTH),
    description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
    frequency: z.object({ count: positiveInt, period: z.enum(FREQUENCY_PERIODS) }),
    minutesPerRun: positiveInt,
    peopleCount: positiveInt,
});
export type SubmitRequestBody = z.infer<typeof submitRequestSchema>;

export const pageQuerySchema = paginationQuerySchema;
export type PageQuery = z.infer<typeof pageQuerySchema>;

const existingSkill = z.strictObject({ skillId: z.uuid() });
const newSkill = z.strictObject({
    agentId: z.uuid(),
    name: z.string().trim().min(1).max(MAX_SKILL_NAME_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).default(''),
});

/** Либо существующий навык, либо новый у агента; смешение вариантов отвергается. */
export const acceptRequestSchema = z.union([existingSkill, newSkill]);
export type AcceptRequestBody = z.infer<typeof acceptRequestSchema>;

export const rejectRequestSchema = z.object({
    reason: z.string().trim().min(1).max(MAX_REJECT_REASON_LENGTH),
});
export type RejectRequestBody = z.infer<typeof rejectRequestSchema>;
