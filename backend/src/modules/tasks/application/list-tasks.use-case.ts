import { Injectable } from '@nestjs/common';
import type { PaginationQuery } from '../../../shared/http/pagination.schema';
import type { Actor } from '../domain/actor';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import type { TaskFilter } from '../domain/task-filter';
import type { TaskSort } from '../domain/task-sort';
import { toTaskViews, type TaskSummary } from './task-view';

export interface TaskListResult {
    items: TaskSummary[];
    total: number;
    limit: number;
    page: number;
}

@Injectable()
export class ListTasksUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly users: UserDirectory,
    ) {}

    /** Access is not narrowed per task: any authenticated user lists all tasks (see TaskAccessPolicy). */
    async execute(
        _actor: Actor,
        filter: TaskFilter,
        sort: TaskSort,
        page: PaginationQuery,
    ): Promise<TaskListResult> {
        const { items, total } = await this.tasks.list(filter, sort, page);
        return {
            items: await toTaskViews(items, this.users),
            total,
            limit: page.limit,
            page: page.page,
        };
    }
}
