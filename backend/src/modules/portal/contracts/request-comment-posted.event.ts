import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';

export const REQUEST_COMMENT_POSTED_EVENT_TYPE = 'portal.request_comment_posted';

export const COMMENT_EXCERPT_LENGTH = 200;

export const requestCommentPostedPayloadSchema = z.object({
    requestId: z.string().min(1),
    requestAuthorId: z.string().min(1),
    commenterId: z.string().min(1),
    requestTitle: z.string().min(1),
    excerpt: z.string().min(1).max(COMMENT_EXCERPT_LENGTH),
});

export type RequestCommentPostedPayload = z.infer<typeof requestCommentPostedPayloadSchema>;

/** Выдержка из комментария: до 200 символов; при обрезке последний символ — «…». */
export function commentExcerpt(body: string): string {
    if (body.length <= COMMENT_EXCERPT_LENGTH) return body;
    let cut = body.slice(0, COMMENT_EXCERPT_LENGTH - 1);
    // Не оставляем одиночный high surrogate: JSONB его не принимает.
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return `${cut}…`;
}

/** Добавлен комментарий к заявке; идентификатор агрегата равен идентификатору комментария. */
export class RequestCommentPostedEvent extends DomainEvent {
    readonly requestId: string;

    readonly requestAuthorId: string;

    readonly commenterId: string;

    readonly requestTitle: string;

    readonly excerpt: string;

    constructor(props: DomainEventProps<RequestCommentPostedPayload>) {
        super(props);
        this.requestId = props.requestId;
        this.requestAuthorId = props.requestAuthorId;
        this.commenterId = props.commenterId;
        this.requestTitle = props.requestTitle;
        this.excerpt = props.excerpt;
    }

    get commentId(): string {
        return this.aggregateId;
    }
}
