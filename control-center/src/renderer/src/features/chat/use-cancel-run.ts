import { useMutation } from '@tanstack/react-query'
import { cancelRun } from '@/lib/backend/threads.api'

// cancelRun is idempotent: 204 and 404 resolve, so only real failures reach onError.
export function useCancelRun(threadId: string) {
  return useMutation({ mutationFn: () => cancelRun(threadId) })
}
