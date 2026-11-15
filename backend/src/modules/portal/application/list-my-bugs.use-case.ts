import { Injectable } from '@nestjs/common';
import { BugQuery, type BugListRecord } from '../domain/ports/bug-query.port';
import type { Page, PageRequest } from '../domain/ports/page';

export interface ListMyBugsInput {
    authorId: string;
    page: PageRequest;
}

/** Свои баги, новые первыми. */
@Injectable()
export class ListMyBugsUseCase {
    constructor(private readonly query: BugQuery) {}

    execute(input: ListMyBugsInput): Promise<Page<BugListRecord>> {
        return this.query.listByAuthor(input.authorId, input.page);
    }
}
