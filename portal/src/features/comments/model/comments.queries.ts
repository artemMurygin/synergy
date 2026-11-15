import { queryOptions } from '@tanstack/react-query'
import { COMMENTS_KEY } from '@/lib/query-keys'
import { listComments } from './comments.api'

export const COMMENTS_POLL_MS = 30_000

/** The feed is polled only while the request screen is open in a visible tab. */
export function commentsQuery(requestId: string) {
  return queryOptions({
    queryKey: [...COMMENTS_KEY, requestId],
    queryFn: () => listComments(requestId),
    refetchInterval: COMMENTS_POLL_MS,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false
  })
}
