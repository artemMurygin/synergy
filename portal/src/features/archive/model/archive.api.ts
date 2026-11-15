import { authorizedRequest } from '@/features/auth'
import { agentSchema, archiveSchema, skillSchema, type Agent, type Archive, type Skill } from '@/lib/schemas'

export function getArchive(): Promise<Archive> {
  return authorizedRequest('/portal/archive', { schema: archiveSchema })
}

export function restoreAgent(agentId: string): Promise<Agent> {
  return authorizedRequest(`/portal/agents/${encodeURIComponent(agentId)}/restore`, { method: 'POST', schema: agentSchema })
}

export function restoreSkill(skillId: string): Promise<Skill> {
  return authorizedRequest(`/portal/skills/${encodeURIComponent(skillId)}/restore`, { method: 'POST', schema: skillSchema })
}
