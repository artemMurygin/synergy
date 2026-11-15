import { BugComment } from '../domain/bug-comment';
import { CommentBody } from '../domain/comment-body';
import type { BugCommentRecord } from '../domain/ports/bug-comment-query.port';

/** Комментарий к багу для клиента: read-модель + признак «можно править» от домена. */
export interface BugCommentView extends BugCommentRecord {
    canEdit: boolean;
}

/** `canEdit` считает домен (`BugComment.canEdit`) — единственное место правила окна. */
export function toBugCommentView(
    record: BugCommentRecord,
    bugId: string,
    actorId: string,
    now: Date,
): BugCommentView {
    const comment = BugComment.restore({
        id: record.id,
        bugId,
        authorId: record.authorId,
        body: CommentBody.of(record.body),
        createdAt: record.createdAt,
        editedAt: record.editedAt,
    });
    return { ...record, canEdit: comment.canEdit(actorId, now) };
}
