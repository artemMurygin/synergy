import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '@/lib/errors'
import { AGENTS_KEY, ARCHIVE_KEY, CATALOG_KEY, SKILLS_KEY } from '@/lib/query-keys'
import type { Agent, Skill } from '@/lib/schemas'
import { restoreAgent, restoreSkill } from './archive.api'

export const AGENT_ARCHIVED_MESSAGE = 'Сначала восстановите агента'

export function restoreErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.code === 'PORTAL_AGENT_ARCHIVED' ? AGENT_ARCHIVED_MESSAGE : error.message
  return 'Не удалось восстановить'
}

function invalidateAll(client: QueryClient) {
  return Promise.all([ARCHIVE_KEY, CATALOG_KEY, SKILLS_KEY, AGENTS_KEY].map((queryKey) => client.invalidateQueries({ queryKey })))
}

/** Restores an archived agent (its skills are not touched) and reloads every list that shows it. */
export function useRestoreAgent(): UseMutationResult<Agent, ApiError, string> {
  const client = useQueryClient()
  return useMutation<Agent, ApiError, string>({
    mutationFn: restoreAgent,
    onSuccess: () => invalidateAll(client)
  })
}

/** Restores an archived skill; the server answers 409 PORTAL_AGENT_ARCHIVED while its agent is still archived. */
export function useRestoreSkill(): UseMutationResult<Skill, ApiError, string> {
  const client = useQueryClient()
  return useMutation<Skill, ApiError, string>({
    mutationFn: restoreSkill,
    onSuccess: () => invalidateAll(client)
  })
}
