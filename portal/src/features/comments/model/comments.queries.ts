import { queryOptions } from '@tanstack/react-query'
import { COMMENTS_KEY } from '@/lib/query-keys'
import { listComments } from './comments.api'
import type { CommentSubject } from './comments.schema'

export const COMMENTS_POLL_MS = 30_000

/** The feed is polled only while the request or bug screen is open in a visible tab. */
export function commentsQuery(subject: CommentSubject, subjectId: string) {
  return queryOptions({
    queryKey: [...COMMENTS_KEY, subject, subjectId],
    queryFn: () => listComments(subject, subjectId),
    refetchInterval: COMMENTS_POLL_MS,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false
  })
}
