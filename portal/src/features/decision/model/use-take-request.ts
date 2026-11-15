import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import type { IdeaRequest } from '@/lib/schemas'
import { applyTaken, refreshAfterTakeConflict } from './decision-cache'
import { takeRequest } from './decision.api'

/** Takes a request into work; the argument is the request id. */
export function useTakeRequest(): UseMutationResult<IdeaRequest, ApiError, string> {
  const client = useQueryClient()
  return useMutation<IdeaRequest, ApiError, string>({
    mutationFn: (requestId) => takeRequest(requestId),
    onSuccess: (taken) => applyTaken(client, taken),
    onError: (error, requestId) => {
      if (error.kind === 'conflict') return refreshAfterTakeConflict(client, requestId)
    }
  })
}
