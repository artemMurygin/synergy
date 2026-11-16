import type { CommentBody } from './comment-body';
import { CommentEditWindowExpiredError, CommentNotOwnedError } from './errors';

export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface RestoreRequestCommentProps {
    id: string;
    requestId: string;
    authorId: string;
    body: CommentBody;
    createdAt: Date;
    editedAt: Date | null;
}

export interface CreateRequestCommentProps {
    id: string;
    requestId: string;
    authorId: string;
    body: CommentBody;
    now: Date;
}

/** Комментарий к заявке: отдельный агрегат, правка автором в течение 15 минут от создания. */
export class RequestComment {
    private constructor(
        readonly id: string,
        readonly requestId: string,
        readonly authorId: string,
        private _body: CommentBody,
        readonly createdAt: Date,
        private _editedAt: Date | null,
    ) {}

    static create(props: CreateRequestCommentProps): RequestComment {
        return new RequestComment(
            props.id,
            props.requestId,
            props.authorId,
            props.body,
            props.now,
            null,
        );
    }

    static restore(props: RestoreRequestCommentProps): RequestComment {
        return new RequestComment(
            props.id,
            props.requestId,
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
