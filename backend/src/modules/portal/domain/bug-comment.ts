import type { CommentBody } from './comment-body';
import { CommentEditWindowExpiredError, CommentNotOwnedError } from './errors';
import { COMMENT_EDIT_WINDOW_MS } from './request-comment';

export { COMMENT_EDIT_WINDOW_MS };

export interface RestoreBugCommentProps {
    id: string;
    bugId: string;
    authorId: string;
    body: CommentBody;
    createdAt: Date;
    editedAt: Date | null;
}

export interface CreateBugCommentProps {
    id: string;
    bugId: string;
    authorId: string;
    body: CommentBody;
    now: Date;
}

/** Комментарий к багу: отдельный агрегат, правка автором в течение 15 минут от создания. */
export class BugComment {
    private constructor(
        readonly id: string,
        readonly bugId: string,
        readonly authorId: string,
        private _body: CommentBody,
        readonly createdAt: Date,
        private _editedAt: Date | null,
    ) {}

    static create(props: CreateBugCommentProps): BugComment {
        return new BugComment(props.id, props.bugId, props.authorId, props.body, props.now, null);
    }

    static restore(props: RestoreBugCommentProps): BugComment {
        return new BugComment(
            props.id,
            props.bugId,
            props.authorId,
            props.body,
            props.createdAt,
            props.editedAt,
        );
    }

    get body(): CommentBody {
        return this._body;
    }

    get editedAt(): Date | null {
        return this._editedAt;
    }

    /** Окно считается от `createdAt` и правкой не продлевается. */
    canEdit(by: string, now: Date): boolean {
        return (
            by === this.authorId &&
            now.getTime() - this.createdAt.getTime() <= COMMENT_EDIT_WINDOW_MS
        );
    }

    edit(by: string, body: CommentBody, now: Date): void {
        if (by !== this.authorId) throw new CommentNotOwnedError(this.id);
        if (!this.canEdit(by, now)) throw new CommentEditWindowExpiredError(this.id);
        this._body = body;
        this._editedAt = now;
    }
}
