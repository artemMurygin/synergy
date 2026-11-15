import { queryOptions } from '@tanstack/react-query'
import { GUIDES_KEY } from '@/lib/query-keys'
import { getAgentGuide } from './guides.api'

export function agentGuideQuery(agentId: string) {
  return queryOptions({
    queryKey: [...GUIDES_KEY, agentId],
    queryFn: () => getAgentGuide(agentId)
  })
}
