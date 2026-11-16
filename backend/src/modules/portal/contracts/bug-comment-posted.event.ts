import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';
import { COMMENT_EXCERPT_LENGTH } from './request-comment-posted.event';

export const BUG_COMMENT_POSTED_EVENT_TYPE = 'portal.bug_comment_posted';

export const bugCommentPostedPayloadSchema = z.object({
    bugId: z.string().min(1),
    bugAuthorId: z.string().min(1),
    commenterId: z.string().min(1),
    bugTitle: z.string().min(1),
    excerpt: z.string().min(1).max(COMMENT_EXCERPT_LENGTH),
});

export type BugCommentPostedPayload = z.infer<typeof bugCommentPostedPayloadSchema>;

/** Добавлен комментарий к багу; идентификатор агрегата равен идентификатору комментария. */
export class BugCommentPostedEvent extends DomainEvent {
    readonly bugId: string;

    readonly bugAuthorId: string;

    readonly commenterId: string;

    readonly bugTitle: string;

    readonly excerpt: string;

    constructor(props: DomainEventProps<BugCommentPostedPayload>) {
        super(props);
        this.bugId = props.bugId;
        this.bugAuthorId = props.bugAuthorId;
        this.commenterId = props.commenterId;
        this.bugTitle = props.bugTitle;
        this.excerpt = props.excerpt;
    }

    get commentId(): string {
        return this.aggregateId;
    }
}
