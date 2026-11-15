import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import {
    commentExcerpt,
    RequestCommentPostedEvent,
} from '../contracts/request-comment-posted.event';
import { CommentBody } from '../domain/comment-body';
import { RequestNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { CommentQuery } from '../domain/ports/comment-query.port';
import { CommentRepository } from '../domain/ports/comment-repository.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { RequestAccessPolicy } from '../domain/request-access-policy';
import { RequestComment } from '../domain/request-comment';
import { toCommentView, type CommentView } from './comment-view';

export interface PostCommentInput {
    requestId: string;
    actorId: string;
    roles: readonly string[];
    body: string;
}

/** Добавить комментарий в любом статусе заявки; событие уходит в outbox в той же транзакции. */
@Injectable()
export class PostCommentUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly comments: CommentRepository,
        private readonly query: CommentQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: PostCommentInput): Promise<CommentView> {
        const commentId = await this.transactions.run(async () => {
            const request = await this.requests.findById(input.requestId);
            if (
                request === null ||
                !RequestAccessPolicy.canView(request, { id: input.actorId, roles: input.roles })
            ) {
                throw new RequestNotFoundError(input.requestId);
            }
            const body = CommentBody.of(input.body);
            const comment = RequestComment.create({
                id: randomUUID(),
                requestId: request.id,
                authorId: input.actorId,
                body,
                now: this.clock.now(),
            });
            await this.comments.insert(comment);
            await this.events.publish([
                new RequestCommentPostedEvent({
                    aggregateId: comment.id,
                    metadata: { userId: input.actorId },
                    requestId: request.id,
                    requestAuthorId: request.authorId,
                    commenterId: input.actorId,
                    requestTitle: request.title.value,
                    excerpt: commentExcerpt(body.value),
                }),
            ]);
            return comment.id;
        });
        const record = await this.query.findView(commentId);
        if (record === null) throw new RequestNotFoundError(input.requestId);
        return toCommentView(record, input.requestId, input.actorId, this.clock.now());
    }
}
