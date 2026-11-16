import { authorizedRequest } from '@/features/auth'
import { guideResponseSchema, type GuideResponse } from './guides.schema'

function guidePath(agentId: string): string {
  return `/portal/agents/${encodeURIComponent(agentId)}/guide`
}

export function getAgentGuide(agentId: string): Promise<GuideResponse> {
  return authorizedRequest(guidePath(agentId), { schema: guideResponseSchema })
}

/** Replaces the whole guide; a body that is empty after trim deletes it. */
export function saveAgentGuide(agentId: string, body: string): Promise<GuideResponse> {
  return authorizedRequest(guidePath(agentId), { method: 'PUT', body: { body }, schema: guideResponseSchema })
}
