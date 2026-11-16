import { CommentBody } from '../domain/comment-body';
import type { CommentRecord } from '../domain/ports/comment-query.port';
import { RequestComment } from '../domain/request-comment';

/** Комментарий для клиента: read-модель + признак «можно править» от домена. */
export interface CommentView extends CommentRecord {
    canEdit: boolean;
}

/** `canEdit` считает домен (`RequestComment.canEdit`) — единственное место правила окна. */
export function toCommentView(
    record: CommentRecord,
    requestId: string,
    actorId: string,
    now: Date,
): CommentView {
    const comment = RequestComment.restore({
        id: record.id,
        requestId,
        authorId: record.authorId,
        body: CommentBody.of(record.body),
        createdAt: record.createdAt,
        editedAt: record.editedAt,
    });
    return { ...record, canEdit: comment.canEdit(actorId, now) };
}
