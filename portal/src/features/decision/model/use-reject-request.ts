import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import type { IdeaRequest } from '@/lib/schemas'
import { applyDecision, refreshAfterConflict } from './decision-cache'
import { rejectRequest } from './decision.api'

export interface RejectRequestInput {
  requestId: string
  reason: string
}

export function useRejectRequest(): UseMutationResult<IdeaRequest, ApiError, RejectRequestInput> {
  const client = useQueryClient()
  return useMutation<IdeaRequest, ApiError, RejectRequestInput>({
    mutationFn: ({ requestId, reason }) => rejectRequest(requestId, reason),
    onSuccess: (decided) => applyDecision(client, decided),
    onError: (error) => {
      if (error.kind === 'conflict') return refreshAfterConflict(client, error)
    }
  })
}
