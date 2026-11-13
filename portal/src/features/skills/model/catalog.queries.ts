import { queryOptions } from '@tanstack/react-query'
import { listAgents } from './skills.api'

export function agentsQuery() {
  return queryOptions({
    queryKey: ['agents'] as const,
    queryFn: listAgents,
    staleTime: 5 * 60_000
  })
}
