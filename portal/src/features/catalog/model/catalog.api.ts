import { authorizedRequest } from '@/features/auth'
import { agentSchema, catalogSchema, type Agent, type Catalog } from '@/lib/schemas'

export function getCatalog(): Promise<Catalog> {
  return authorizedRequest('/portal/catalog', { schema: catalogSchema })
}

export function archiveAgent(agentId: string): Promise<Agent> {
  return authorizedRequest(`/portal/agents/${encodeURIComponent(agentId)}/archive`, { method: 'POST', schema: agentSchema })
}
