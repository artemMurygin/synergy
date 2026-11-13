import { Injectable } from '@nestjs/common';
import { RequestQuery } from '../domain/ports/request-query.port';
import type { Page, RequestView } from './request-view';

export interface ListQueueInput {
    limit: number;
    page: number;
}

/** Очередь заявок без решения, старые первыми. Доступ ограничивает `RolesGuard`. */
@Injectable()
export class ListQueueUseCase {
    constructor(private readonly query: RequestQuery) {}

    execute(input: ListQueueInput): Promise<Page<RequestView>> {
        return this.query.listPending({ limit: input.limit, page: input.page });
    }
}
