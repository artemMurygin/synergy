import { Injectable } from '@nestjs/common';
import { RequestQuery } from '../domain/ports/request-query.port';
import type { Page, RequestView } from './request-view';

export interface ListMyRequestsInput {
    authorId: string;
    limit: number;
    page: number;
}

@Injectable()
export class ListMyRequestsUseCase {
    constructor(private readonly query: RequestQuery) {}

    execute(input: ListMyRequestsInput): Promise<Page<RequestView>> {
        return this.query.listByAuthor(input.authorId, { limit: input.limit, page: input.page });
    }
}
