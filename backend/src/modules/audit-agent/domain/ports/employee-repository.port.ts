import type { Employee } from '../aggregates/employee.aggregate';

export abstract class EmployeeRepositoryPort {
    abstract findByUsername(username: string): Promise<Employee | null>;

    abstract findByResponsibleId(id: string): Promise<Employee | null>;
}
