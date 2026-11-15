import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { MAX_CATALOG_NAME_LENGTH } from '../../domain/catalog-name';
import { MAX_EFFORT_HOURS } from '../../domain/effort-hours';
import { MAX_REJECT_REASON_LENGTH } from '../../domain/reject-reason';
import { MAX_REQUEST_TITLE_LENGTH } from '../../domain/request-title';
import { MAX_SKILL_NAME_LENGTH } from '../../domain/skill-name';
import { FREQUENCY_PERIODS } from '../../domain/frequency';

const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_PRODUCTS_PER_AGENT = 50;
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

const catalogName = z.string().trim().min(1).max(MAX_CATALOG_NAME_LENGTH);
const skillName = z.string().trim().min(1).max(MAX_SKILL_NAME_LENGTH);
const skillDescription = z.string().max(MAX_DESCRIPTION_LENGTH).default('');

const existingSkill = z.strictObject({ kind: z.literal('existing_skill'), skillId: z.uuid() });
const newSkill = z.strictObject({
    kind: z.literal('new_skill'),
    agentId: z.uuid(),
    name: skillName,
    description: skillDescription,
});
const newAgent = z.strictObject({
    kind: z.literal('new_agent'),
    agent: z
        .strictObject({
            name: catalogName,
            productIds: z.array(z.uuid()).max(MAX_PRODUCTS_PER_AGENT),
            newProduct: z.strictObject({ name: catalogName }).optional(),
        })
        .refine((agent) => agent.productIds.length > 0 || agent.newProduct !== undefined, {
            message: 'Agent needs at least one product',
            path: ['productIds'],
        }),
    skill: z.strictObject({ name: skillName, description: skillDescription }),
});

/** Цель принятия: существующий навык, новый навык у агента или новый агент (с продуктами). */
export const acceptRequestSchema = z.strictObject({
    effortHours: z.number().int().min(1).max(MAX_EFFORT_HOURS),
    target: z.discriminatedUnion('kind', [existingSkill, newSkill, newAgent]),
});
export type AcceptRequestBody = z.infer<typeof acceptRequestSchema>;

export const rejectRequestSchema = z.object({
    reason: z.string().trim().min(1).max(MAX_REJECT_REASON_LENGTH),
});
export type RejectRequestBody = z.infer<typeof rejectRequestSchema>;
