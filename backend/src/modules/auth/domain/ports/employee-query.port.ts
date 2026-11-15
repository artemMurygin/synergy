import type { DepartmentView } from '../department-view';
import type { EmployeeListFilter, EmployeeView } from '../employee-view';

export abstract class EmployeeQuery {
    /** Employees ordered by last name, first name, login, with the overall total. */
    abstract list(filter: EmployeeListFilter): Promise<{ items: EmployeeView[]; total: number }>;
    abstract findById(userId: string): Promise<EmployeeView | null>;
    /** Departments ordered by name. */
    abstract listDepartments(): Promise<DepartmentView[]>;
    abstract findDepartmentById(id: string): Promise<DepartmentView | null>;
}
