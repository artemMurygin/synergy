import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { COMMENTS_KEY } from '@/lib/query-keys'
import { postComment } from './comments.api'
import type { Comment, CommentList, CommentSubject } from './comments.schema'

/** Posts a comment; on success it lands at the end of the cached feed, then the feed is refetched. */
export function usePostComment(subject: CommentSubject, subjectId: string): UseMutationResult<Comment, ApiError, string> {
  const client = useQueryClient()
  const key = [...COMMENTS_KEY, subject, subjectId]
  return useMutation<Comment, ApiError, string>({
    mutationFn: (body) => postComment(subject, subjectId, body),
    onSuccess: (comment) => {
      client.setQueryData<CommentList>(key, (old) => (old ? { items: [...old.items, comment] } : old))
      return client.invalidateQueries({ queryKey: key })
    }
  })
}
