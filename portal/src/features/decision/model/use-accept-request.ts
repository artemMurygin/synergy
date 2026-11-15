import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import type { IdeaRequest } from '@/lib/schemas'
import { applyDecision, isNameConflict, refreshAfterConflict } from './decision-cache'
import { acceptRequest, type AcceptTarget } from './decision.api'

export interface AcceptRequestInput {
  requestId: string
  effortHours: number
  target: AcceptTarget
}

export function useAcceptRequest(): UseMutationResult<IdeaRequest, ApiError, AcceptRequestInput> {
  const client = useQueryClient()
  return useMutation<IdeaRequest, ApiError, AcceptRequestInput>({
    mutationFn: ({ requestId, effortHours, target }) => acceptRequest(requestId, { effortHours, target }),
    onSuccess: (decided) => applyDecision(client, decided),
    onError: (error) => {
      if (error.kind === 'conflict' && !isNameConflict(error)) return refreshAfterConflict(client, error)
    }
  })
}
