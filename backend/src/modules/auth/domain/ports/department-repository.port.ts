import type { Department } from '../department';
import type { DepartmentName } from '../department-name';

export abstract class DepartmentRepository {
    abstract findById(id: string): Promise<Department | null>;
    /** Inserts or updates by id, including the head. */
    abstract save(department: Department): Promise<void>;
    /** Case-insensitive; the department exceptId is ignored. */
    abstract isNameTaken(name: DepartmentName, exceptId?: string): Promise<boolean>;
    /** Number of employees whose profile points at the department. */
    abstract countEmployees(departmentId: string): Promise<number>;
    abstract delete(id: string): Promise<void>;
}
