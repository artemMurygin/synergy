import type { Role } from './role';

export interface DepartmentRef {
    id: string;
    name: string;
}

/** Read model of an employee for the admin directory: user, profile, department and roles joined. */
export interface EmployeeView {
    id: string;
    login: string;
    isActive: boolean;
    mustChangePassword: boolean;
    fullName: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    position: string | null;
    email: string | null;
    scrmEmployeeId: string | null;
    department: DepartmentRef | null;
    roles: Role[];
}

export interface EmployeeListFilter {
    search?: string;
    departmentId?: string;
    isActive?: boolean;
    limit: number;
    page: number;
}
