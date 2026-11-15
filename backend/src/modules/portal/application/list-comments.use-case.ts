import { Injectable } from '@nestjs/common';
import { RequestNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { CommentQuery } from '../domain/ports/comment-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { RequestAccessPolicy } from '../domain/request-access-policy';
import { toCommentView, type CommentView } from './comment-view';

export interface ListCommentsInput {
    requestId: string;
    actorId: string;
    roles: readonly string[];
}

/** Лента комментариев заявки; доступ — по `RequestAccessPolicy`, иначе 404. */
@Injectable()
export class ListCommentsUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly query: CommentQuery,
        private readonly clock: Clock,
    ) {}

    async execute(input: ListCommentsInput): Promise<CommentView[]> {
        const request = await this.requests.findById(input.requestId);
        if (
            request === null ||
            !RequestAccessPolicy.canView(request, { id: input.actorId, roles: input.roles })
        ) {
            throw new RequestNotFoundError(input.requestId);
        }
        const now = this.clock.now();
        const records = await this.query.listByRequest(input.requestId);
        return records.map((record) => toCommentView(record, input.requestId, input.actorId, now));
    }
}
