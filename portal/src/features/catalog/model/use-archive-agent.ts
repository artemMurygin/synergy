import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { AGENTS_KEY, ARCHIVE_KEY, CATALOG_KEY, SKILLS_KEY } from '@/lib/query-keys'
import type { Agent } from '@/lib/schemas'
import { archiveAgent } from './catalog.api'

/** Archives an agent with all its skills; the catalog, skills, agents and archive views are reloaded. */
export function useArchiveAgent(): UseMutationResult<Agent, ApiError, string> {
  const client = useQueryClient()
  return useMutation<Agent, ApiError, string>({
    mutationFn: archiveAgent,
    onSuccess: () => Promise.all([CATALOG_KEY, SKILLS_KEY, AGENTS_KEY, ARCHIVE_KEY].map((queryKey) => client.invalidateQueries({ queryKey })))
  })
}
