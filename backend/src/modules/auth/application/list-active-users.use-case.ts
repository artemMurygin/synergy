import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '../../../shared/http/pagination.schema';
import { UserRepository } from '../domain/ports/user-repository.port';
import type { UserSearch } from '../domain/user-search';
import type { UserSummary } from '../domain/user-summary';

export interface UserListResult {
    items: UserSummary[];
    total: number;
    limit: number;
    page: number;
}

@Injectable()
export class ListActiveUsersUseCase {
    constructor(private readonly users: UserRepository) {}

    /** Zero-based page of active users, ordered by login. */
    async execute(search: UserSearch, page: PaginationQuery): Promise<UserListResult> {
        const { items, total } = await this.users.searchActive(
            search,
            page.limit,
            page.page * page.limit,
        );
        return {
            items: items.map(({ id, login }) => ({ id, login })),
            total,
            limit: page.limit,
            page: page.page,
        };
    }
}
