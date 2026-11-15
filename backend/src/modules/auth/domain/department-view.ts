/** Read model of a department with its head and employee count. */
export interface DepartmentView {
    id: string;
    name: string;
    head: { id: string; login: string; fullName: string; isActive: boolean } | null;
    employeeCount: number;
}
