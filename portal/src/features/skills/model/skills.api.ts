import { z } from 'zod'
import { authorizedRequest } from '@/features/auth'
import { agentSchema, pageSchema, skillSchema, type Agent, type Skill, type SkillStatus } from '@/lib/schemas'

export const SKILLS_PAGE_SIZE = 20

const skillsPageSchema = pageSchema(skillSchema)
export type SkillsPage = ReturnType<typeof skillsPageSchema.parse>

// the agents list is short; accept a plain array as well as a paged answer
const agentsAnswerSchema = z.union([z.array(agentSchema), pageSchema(agentSchema).transform((p) => p.items)])

export function listSkills(status: SkillStatus | undefined, page: number): Promise<SkillsPage> {
  return authorizedRequest('/portal/skills', {
    query: { status, page, limit: SKILLS_PAGE_SIZE },
    schema: skillsPageSchema
  })
}

export function changeSkillStatus(skillId: string, to: SkillStatus): Promise<Skill> {
  return authorizedRequest(`/portal/skills/${encodeURIComponent(skillId)}/status`, {
    method: 'POST',
    body: { status: to },
    schema: skillSchema
  })
}

export function archiveSkill(skillId: string): Promise<Skill> {
  return authorizedRequest(`/portal/skills/${encodeURIComponent(skillId)}/archive`, { method: 'POST', schema: skillSchema })
}

export function listAgents(): Promise<Agent[]> {
  return authorizedRequest('/portal/agents', { query: { limit: 100 }, schema: agentsAnswerSchema })
}
