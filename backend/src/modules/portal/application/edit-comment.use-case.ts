import { Injectable } from '@nestjs/common';
import { CommentBody } from '../domain/comment-body';
import { CommentNotFoundError, RequestNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { CommentQuery } from '../domain/ports/comment-query.port';
import { CommentRepository } from '../domain/ports/comment-repository.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { RequestAccessPolicy } from '../domain/request-access-policy';
import { toCommentView, type CommentView } from './comment-view';

export interface EditCommentInput {
    requestId: string;
    commentId: string;
    actorId: string;
    roles: readonly string[];
    body: string;
}

/** Правка своего комментария в окне 15 минут; событий и уведомлений не создаёт. */
@Injectable()
export class EditCommentUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly comments: CommentRepository,
        private readonly query: CommentQuery,
        private readonly clock: Clock,
    ) {}

    async execute(input: EditCommentInput): Promise<CommentView> {
        const request = await this.requests.findById(input.requestId);
        if (
            request === null ||
            !RequestAccessPolicy.canView(request, { id: input.actorId, roles: input.roles })
        ) {
            throw new RequestNotFoundError(input.requestId);
        }
        const comment = await this.comments.findById(input.commentId);
        if (comment?.requestId !== input.requestId) {
            throw new CommentNotFoundError(input.commentId);
        }
        comment.edit(input.actorId, CommentBody.of(input.body), this.clock.now());
        await this.comments.update(comment);
        const record = await this.query.findView(comment.id);
        if (record === null) throw new CommentNotFoundError(input.commentId);
        return toCommentView(record, input.requestId, input.actorId, this.clock.now());
    }
}
