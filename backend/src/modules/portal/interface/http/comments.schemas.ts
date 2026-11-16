import { z } from 'zod';

/** Верхняя граница только защищает от гигантских тел до trim; длину и пустоту проверяет `CommentBody`. */
export const MAX_COMMENT_REQUEST_LENGTH = 20000;

export const postCommentSchema = z.object({ body: z.string().max(MAX_COMMENT_REQUEST_LENGTH) });
export type PostCommentBody = z.infer<typeof postCommentSchema>;

export const editCommentSchema = postCommentSchema;
export type EditCommentBody = z.infer<typeof editCommentSchema>;
