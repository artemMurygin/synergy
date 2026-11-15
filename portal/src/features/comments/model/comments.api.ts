import { authorizedRequest } from '@/features/auth'
import { commentListSchema, commentSchema, type Comment, type CommentList } from './comments.schema'

export function listComments(requestId: string): Promise<CommentList> {
  return authorizedRequest(`/portal/requests/${requestId}/comments`, { schema: commentListSchema })
}

export function postComment(requestId: string, body: string): Promise<Comment> {
  return authorizedRequest(`/portal/requests/${requestId}/comments`, { method: 'POST', body: { body }, schema: commentSchema })
}

export function editComment(requestId: string, commentId: string, body: string): Promise<Comment> {
  return authorizedRequest(`/portal/requests/${requestId}/comments/${commentId}`, { method: 'PATCH', body: { body }, schema: commentSchema })
}
