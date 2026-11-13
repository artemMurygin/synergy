import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { SKILL_STATUSES } from '../../domain/skill-status';
import { MAX_SKILL_NAME_LENGTH } from '../../domain/skill-name';

const MAX_DESCRIPTION_LENGTH = 10000;

export const listSkillsQuerySchema = paginationQuerySchema.extend({
    status: z.enum(SKILL_STATUSES).optional(),
});
export type ListSkillsQuery = z.infer<typeof listSkillsQuerySchema>;

export const createSkillSchema = z.object({
    agentId: z.uuid(),
    name: z.string().trim().min(1).max(MAX_SKILL_NAME_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).default(''),
});
export type CreateSkillBody = z.infer<typeof createSkillSchema>;

export const changeSkillStatusSchema = z.object({ status: z.enum(SKILL_STATUSES) });
export type ChangeSkillStatusBody = z.infer<typeof changeSkillStatusSchema>;
