import { Injectable } from '@nestjs/common';
import type { EmployeeListFilter, EmployeeView } from '../domain/employee-view';
import { EmployeeQuery } from '../domain/ports/employee-query.port';

export interface EmployeeListResult {
    items: EmployeeView[];
    total: number;
    limit: number;
    page: number;
}

/** Admin directory page. Without `isActive` both active and dismissed employees are returned. */
@Injectable()
export class ListEmployeesUseCase {
    constructor(private readonly employees: EmployeeQuery) {}

    async execute(filter: EmployeeListFilter): Promise<EmployeeListResult> {
        const { items, total } = await this.employees.list(filter);
        return { items, total, limit: filter.limit, page: filter.page };
    }
}
