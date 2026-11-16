import { authorizedRequest } from '@/features/auth'
import { commentListSchema, commentSchema, type Comment, type CommentList, type CommentSubject } from './comments.schema'

function feedPath(subject: CommentSubject, subjectId: string): string {
  return `/portal/${subject}/${subjectId}/comments`
}

export function listComments(subject: CommentSubject, subjectId: string): Promise<CommentList> {
  return authorizedRequest(feedPath(subject, subjectId), { schema: commentListSchema })
}

export function postComment(subject: CommentSubject, subjectId: string, body: string): Promise<Comment> {
  return authorizedRequest(feedPath(subject, subjectId), { method: 'POST', body: { body }, schema: commentSchema })
}

export function editComment(subject: CommentSubject, subjectId: string, commentId: string, body: string): Promise<Comment> {
  return authorizedRequest(`${feedPath(subject, subjectId)}/${commentId}`, { method: 'PATCH', body: { body }, schema: commentSchema })
}
