import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { changeBugStatus } from './bugs.api'
import { BUG_QUEUE_KEY, MY_BUGS_KEY, bugDetailKey } from './bugs.queries'
import type { BugResponse, ChangeBugStatusBody } from './bugs.schema'

/** Changes the status; success refreshes the detail and the lists, a lost race (409) reloads the detail. */
export function useChangeBugStatus(id: string): UseMutationResult<BugResponse, ApiError, ChangeBugStatusBody> {
  const client = useQueryClient()
  return useMutation<BugResponse, ApiError, ChangeBugStatusBody>({
    mutationFn: (body) => changeBugStatus(id, body),
    onSuccess: (bug) => {
      client.setQueryData(bugDetailKey(id), bug)
      return Promise.all([MY_BUGS_KEY, BUG_QUEUE_KEY].map((queryKey) => client.invalidateQueries({ queryKey })))
    },
    onError: (error) => {
      if (error.kind === 'conflict') return client.invalidateQueries({ queryKey: bugDetailKey(id) })
    }
  })
}
