import { Injectable } from '@nestjs/common';
import { BugQuery, type BugListRecord } from '../domain/ports/bug-query.port';
import type { BugStatus } from '../domain/bug-status';
import type { Page, PageRequest } from '../domain/ports/page';

export interface ListBugQueueInput {
    status: BugStatus | null;
    page: PageRequest;
}

/** Очередь багов разработчика. Доступ ограничивает контроллер (роль developer). */
@Injectable()
export class ListBugQueueUseCase {
    constructor(private readonly query: BugQuery) {}

    execute(input: ListBugQueueInput): Promise<Page<BugListRecord>> {
        return this.query.listQueue(input.status, input.page);
    }
}
