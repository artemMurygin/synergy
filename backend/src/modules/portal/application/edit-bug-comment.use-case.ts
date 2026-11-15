import { Injectable } from '@nestjs/common';
import { BugAccessPolicy } from '../domain/bug-access-policy';
import { CommentBody } from '../domain/comment-body';
import { BugNotFoundError, CommentNotFoundError } from '../domain/errors';
import { BugCommentQuery } from '../domain/ports/bug-comment-query.port';
import { BugCommentRepository } from '../domain/ports/bug-comment-repository.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { toBugCommentView, type BugCommentView } from './bug-comment-view';

export interface EditBugCommentInput {
    bugId: string;
    commentId: string;
    actorId: string;
    roles: readonly string[];
    body: string;
}

/** Правка своего комментария к багу в окне 15 минут; событий и уведомлений не создаёт. */
@Injectable()
export class EditBugCommentUseCase {
    constructor(
        private readonly bugs: BugRepository,
        private readonly comments: BugCommentRepository,
        private readonly query: BugCommentQuery,
        private readonly clock: Clock,
    ) {}

    async execute(input: EditBugCommentInput): Promise<BugCommentView> {
        const bug = await this.bugs.findById(input.bugId);
        if (
            bug === null ||
            !BugAccessPolicy.canView(bug, { id: input.actorId, roles: input.roles })
        ) {
            throw new BugNotFoundError(input.bugId);
        }
        const comment = await this.comments.findById(input.commentId);
        if (comment?.bugId !== input.bugId) {
            throw new CommentNotFoundError(input.commentId);
        }
        comment.edit(input.actorId, CommentBody.of(input.body), this.clock.now());
        await this.comments.update(comment);
        const record = await this.query.findView(comment.id);
        if (record === null) throw new CommentNotFoundError(input.commentId);
        return toBugCommentView(record, input.bugId, input.actorId, this.clock.now());
    }
}
