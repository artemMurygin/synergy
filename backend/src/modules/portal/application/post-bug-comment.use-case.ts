import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { BugCommentPostedEvent } from '../contracts/bug-comment-posted.event';
import { commentExcerpt } from '../contracts/request-comment-posted.event';
import { BugAccessPolicy } from '../domain/bug-access-policy';
import { BugComment } from '../domain/bug-comment';
import { CommentBody } from '../domain/comment-body';
import { BugNotFoundError } from '../domain/errors';
import { BugCommentQuery } from '../domain/ports/bug-comment-query.port';
import { BugCommentRepository } from '../domain/ports/bug-comment-repository.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { toBugCommentView, type BugCommentView } from './bug-comment-view';

export interface PostBugCommentInput {
    bugId: string;
    actorId: string;
    roles: readonly string[];
    body: string;
}

/** Добавить комментарий к багу в любом статусе; событие уходит в outbox в той же транзакции. */
@Injectable()
export class PostBugCommentUseCase {
    constructor(
        private readonly bugs: BugRepository,
        private readonly comments: BugCommentRepository,
        private readonly query: BugCommentQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: PostBugCommentInput): Promise<BugCommentView> {
        const commentId = await this.transactions.run(async () => {
            const bug = await this.bugs.findById(input.bugId);
            if (
                bug === null ||
                !BugAccessPolicy.canView(bug, { id: input.actorId, roles: input.roles })
            ) {
                throw new BugNotFoundError(input.bugId);
            }
            const body = CommentBody.of(input.body);
            const comment = BugComment.create({
                id: randomUUID(),
                bugId: bug.id,
                authorId: input.actorId,
                body,
                now: this.clock.now(),
            });
            await this.comments.insert(comment);
            await this.events.publish([
                new BugCommentPostedEvent({
                    aggregateId: comment.id,
                    metadata: { userId: input.actorId },
                    bugId: bug.id,
                    bugAuthorId: bug.authorId,
                    commenterId: input.actorId,
                    bugTitle: bug.title.value,
                    excerpt: commentExcerpt(body.value),
                }),
            ]);
            return comment.id;
        });
        const record = await this.query.findView(commentId);
        if (record === null) throw new BugNotFoundError(input.bugId);
        return toBugCommentView(record, input.bugId, input.actorId, this.clock.now());
    }
}
