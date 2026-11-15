import { Injectable } from '@nestjs/common';
import type { DepartmentView } from '../domain/department-view';
import { EmployeeQuery } from '../domain/ports/employee-query.port';

@Injectable()
export class ListDepartmentsUseCase {
    constructor(private readonly employees: EmployeeQuery) {}

    /** Departments ordered by name, each with its head and employee count. */
    execute(): Promise<DepartmentView[]> {
        return this.employees.listDepartments();
    }
}
