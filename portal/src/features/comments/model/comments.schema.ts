import { z } from 'zod'

export const commentSubjectSchema = z.enum(['requests', 'bugs'])
export type CommentSubject = z.infer<typeof commentSubjectSchema>

export const commentAuthorRoleSchema = z.enum(['request_author', 'bug_author', 'developer'])

export const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: z.object({ id: z.string(), login: z.string(), fullName: z.string() }),
  authorRole: commentAuthorRoleSchema,
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  canEdit: z.boolean()
})

export const commentListSchema = z.object({ items: z.array(commentSchema) })

export type Comment = z.infer<typeof commentSchema>
export type CommentList = z.infer<typeof commentListSchema>
export type CommentAuthorRole = z.infer<typeof commentAuthorRoleSchema>
