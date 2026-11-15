import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { MAX_DEPARTMENT_NAME_LENGTH } from '../../domain/department-name';
import { Email, MAX_EMAIL_LENGTH } from '../../domain/email';
import type { EmployeeView } from '../../domain/employee-view';
import { MAX_LOGIN_LENGTH } from '../../domain/login';
import { MAX_PERSON_NAME_PART_LENGTH } from '../../domain/person-name';
import type { DepartmentView } from '../../domain/department-view';

export const MAX_EMPLOYEE_SEARCH_LENGTH = 100;
export const MAX_POSITION_LENGTH = 200;
export const MAX_SCRM_EMPLOYEE_ID_LENGTH = 64;

const roleName = z.enum(['developer', 'admin']);
const id = z.uuid();
/** Department ids are opaque: seeded departments keep their text ids ("dev"), API ones are UUIDs. */
export const MAX_DEPARTMENT_ID_LENGTH = 64;
export const departmentIdSchema = z.string().min(1).max(MAX_DEPARTMENT_ID_LENGTH);
/** A department reference: an empty string means "none", like in the profile patch of the domain. */
const optionalId = z.union([departmentIdSchema, z.literal('')]);

const requiredName = z.string().trim().min(1).max(MAX_PERSON_NAME_PART_LENGTH);
const middleName = z.string().trim().max(MAX_PERSON_NAME_PART_LENGTH);
const position = z.string().trim().max(MAX_POSITION_LENGTH);
const scrmEmployeeId = z.string().trim().max(MAX_SCRM_EMPLOYEE_ID_LENGTH);
/** The format rules are the ones of the Email value object, so the domain never rejects what passed here. */
const email = z
    .string()
    .max(MAX_EMAIL_LENGTH)
    .refine((value) => {
        try {
            Email.optional(value);
            return true;
        } catch {
            return false;
        }
    }, 'Invalid email');

export const idParamSchema = id;

const isActiveParam = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
    search: z.string().trim().max(MAX_EMPLOYEE_SEARCH_LENGTH).optional(),
    departmentId: departmentIdSchema.optional(),
    isActive: isActiveParam.optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const createEmployeeBodySchema = z.object({
    login: z.string().trim().min(1).max(MAX_LOGIN_LENGTH),
    lastName: requiredName,
    firstName: requiredName,
    middleName: middleName.optional(),
    departmentId: optionalId.optional(),
    position: position.optional(),
    email: email.optional(),
    scrmEmployeeId: scrmEmployeeId.optional(),
    roles: z.array(roleName).optional(),
});
export type CreateEmployeeBody = z.infer<typeof createEmployeeBodySchema>;

/**
 * An omitted field stays as is; an empty string or null clears an optional one. Unknown keys,
 * the login among them, are dropped: the login is not editable.
 */
export const updateEmployeeBodySchema = z.object({
    lastName: requiredName.optional(),
    firstName: requiredName.optional(),
    middleName: middleName.nullable().optional(),
    departmentId: optionalId.nullable().optional(),
    position: position.nullable().optional(),
    email: email.nullable().optional(),
    scrmEmployeeId: scrmEmployeeId.nullable().optional(),
});
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBodySchema>;

export const replaceRolesBodySchema = z.object({ roles: z.array(roleName) });
export type ReplaceRolesBody = z.infer<typeof replaceRolesBodySchema>;

const departmentName = z.string().trim().min(1).max(MAX_DEPARTMENT_NAME_LENGTH);

export const createDepartmentBodySchema = z.object({
    name: departmentName,
    headUserId: id.nullable().optional(),
});
export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;

export const updateDepartmentBodySchema = z.object({
    name: departmentName.optional(),
    headUserId: id.nullable().optional(),
});
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBodySchema>;

/** The wire shape of an employee: an explicit list of fields, so nothing internal can leak. */
export type EmployeeResponse = Omit<EmployeeView, 'mustChangePassword'>;

export interface DepartmentResponse {
    id: string;
    name: string;
    head: { id: string; fullName: string; isActive: boolean } | null;
    employeeCount: number;
}

export function toEmployeeResponse(employee: EmployeeView): EmployeeResponse {
    return {
        id: employee.id,
        login: employee.login,
        lastName: employee.lastName,
        firstName: employee.firstName,
        middleName: employee.middleName,
        fullName: employee.fullName,
        department: employee.department,
        position: employee.position,
        email: employee.email,
        scrmEmployeeId: employee.scrmEmployeeId,
        roles: employee.roles,
        isActive: employee.isActive,
    };
}

export function toDepartmentResponse(department: DepartmentView): DepartmentResponse {
    return {
        id: department.id,
        name: department.name,
        head:
            department.head === null
                ? null
                : {
                      id: department.head.id,
                      fullName: department.head.fullName,
                      isActive: department.head.isActive,
                  },
        employeeCount: department.employeeCount,
    };
}
