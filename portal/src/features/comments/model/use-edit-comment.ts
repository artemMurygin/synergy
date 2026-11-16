import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { COMMENTS_KEY } from '@/lib/query-keys'
import { editComment } from './comments.api'
import type { Comment, CommentList, CommentSubject } from './comments.schema'

export interface EditCommentVariables {
  commentId: string
  body: string
}

/** Edits a comment; on 409/403 the feed is refetched so canEdit reflects the server. */
export function useEditComment(subject: CommentSubject, subjectId: string): UseMutationResult<Comment, ApiError, EditCommentVariables> {
  const client = useQueryClient()
  const key = [...COMMENTS_KEY, subject, subjectId]
  return useMutation<Comment, ApiError, EditCommentVariables>({
    mutationFn: ({ commentId, body }) => editComment(subject, subjectId, commentId, body),
    onSuccess: (comment) => {
      client.setQueryData<CommentList>(key, (old) => (old ? { items: old.items.map((c) => (c.id === comment.id ? comment : c)) } : old))
    },
    onError: (error) => {
      if (error.status === 409 || error.status === 403) return client.invalidateQueries({ queryKey: key })
    }
  })
}
