import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { saveAgentGuide } from './guides.api'
import { agentGuideQuery } from './guides.queries'
import type { GuideResponse } from './guides.schema'

/** Saves the guide of an agent; the response (also the empty one after a deletion) goes straight into the cache. */
export function useSaveGuide(agentId: string): UseMutationResult<GuideResponse, ApiError, string> {
  const client = useQueryClient()
  return useMutation<GuideResponse, ApiError, string>({
    mutationFn: (body) => saveAgentGuide(agentId, body),
    onSuccess: (guide) => {
      client.setQueryData(agentGuideQuery(agentId).queryKey, guide)
    }
  })
}
