import { Injectable } from '@nestjs/common';
import { BugAccessPolicy } from '../domain/bug-access-policy';
import { BugNotFoundError } from '../domain/errors';
import { BugCommentQuery } from '../domain/ports/bug-comment-query.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { toBugCommentView, type BugCommentView } from './bug-comment-view';

export interface ListBugCommentsInput {
    bugId: string;
    actorId: string;
    roles: readonly string[];
}

/** Лента комментариев бага; доступ — по `BugAccessPolicy`, иначе 404. */
@Injectable()
export class ListBugCommentsUseCase {
    constructor(
        private readonly bugs: BugRepository,
        private readonly query: BugCommentQuery,
        private readonly clock: Clock,
    ) {}

    async execute(input: ListBugCommentsInput): Promise<BugCommentView[]> {
        const bug = await this.bugs.findById(input.bugId);
        if (
            bug === null ||
            !BugAccessPolicy.canView(bug, { id: input.actorId, roles: input.roles })
        ) {
            throw new BugNotFoundError(input.bugId);
        }
        const now = this.clock.now();
        const records = await this.query.listByBug(input.bugId);
        return records.map((record) => toBugCommentView(record, input.bugId, input.actorId, now));
    }
}
