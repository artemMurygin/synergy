import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { formatFullName } from '../../../shared/people/full-name';
import type { DepartmentView } from '../domain/department-view';
import type { EmployeeListFilter, EmployeeView } from '../domain/employee-view';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { Role } from '../domain/role';
import { UserSearch } from '../domain/user-search';

const employeeRow = z.object({
    id: z.string(),
    login: z.string(),
    is_active: z.boolean(),
    must_change_password: z.boolean(),
    last_name: z.string().nullable(),
    first_name: z.string().nullable(),
    middle_name: z.string().nullable(),
    position: z.string().nullable(),
    email: z.string().nullable(),
    scrm_employee_id: z.string().nullable(),
    department_id: z.string().nullable(),
    department_name: z.string().nullable(),
    roles: z.array(z.string()),
});

const departmentRow = z.object({
    id: z.string(),
    name: z.string(),
    head_id: z.string().nullable(),
    head_login: z.string().nullable(),
    head_is_active: z.boolean().nullable(),
    head_last_name: z.string().nullable(),
    head_first_name: z.string().nullable(),
    head_middle_name: z.string().nullable(),
    employee_count: z.number(),
});

const EMPLOYEE_SELECT = sql.fragment`
    SELECT u.id, u.login, u.is_active, u.must_change_password,
           p.last_name, p.first_name, p.middle_name, p.position, p.email, p.scrm_employee_id,
           p.department_id, d.name AS department_name,
           COALESCE(
               (SELECT array_agg(r.role ORDER BY r.role)
                FROM auth_user_roles r WHERE r.user_id = u.id),
               ARRAY[]::text[]
           ) AS roles
    FROM auth_users u
    LEFT JOIN auth_user_profiles p ON p.user_id = u.id
    LEFT JOIN auth_departments d ON d.id = p.department_id`;

function toEmployee(raw: unknown): EmployeeView {
    const row = employeeRow.parse(raw);
    return {
        id: row.id,
        login: row.login,
        isActive: row.is_active,
        mustChangePassword: row.must_change_password,
        fullName: formatFullName(
            { lastName: row.last_name, firstName: row.first_name, middleName: row.middle_name },
            row.login,
        ),
        lastName: row.last_name,
        firstName: row.first_name,
        middleName: row.middle_name,
        position: row.position,
        email: row.email,
        scrmEmployeeId: row.scrm_employee_id,
        department:
            row.department_id === null
                ? null
                : { id: row.department_id, name: row.department_name ?? '' },
        roles: row.roles.map((role) => Role.of(role)),
    };
}

function toDepartment(raw: unknown): DepartmentView {
    const row = departmentRow.parse(raw);
    return {
        id: row.id,
        name: row.name,
        head:
            row.head_id === null
                ? null
                : {
                      id: row.head_id,
                      login: row.head_login ?? '',
                      isActive: row.head_is_active ?? false,
                      fullName: formatFullName(
                          {
                              lastName: row.head_last_name,
                              firstName: row.head_first_name,
                              middleName: row.head_middle_name,
                          },
                          row.head_login ?? '',
                      ),
                  },
        employeeCount: row.employee_count,
    };
}

const DEPARTMENT_SELECT = sql.fragment`
    SELECT d.id, d.name,
           h.id AS head_id, h.login AS head_login, h.is_active AS head_is_active,
           hp.last_name AS head_last_name, hp.first_name AS head_first_name,
           hp.middle_name AS head_middle_name,
           (SELECT count(*)::int FROM auth_user_profiles p WHERE p.department_id = d.id)
               AS employee_count
    FROM auth_departments d
    LEFT JOIN auth_users h ON h.id = d.head_user_id
    LEFT JOIN auth_user_profiles hp ON hp.user_id = h.id`;

@Injectable()
export class SlonikEmployeeQuery extends EmployeeQuery {
    constructor(private readonly tx: TransactionRunnerPort) {
        super();
    }

    async list(filter: EmployeeListFilter): Promise<{ items: EmployeeView[]; total: number }> {
        const pattern = UserSearch.of(filter.search).likePattern;
        const conditions = [sql.fragment`TRUE`];
        if (pattern !== null) {
            conditions.push(sql.fragment`(
                p.last_name ILIKE ${pattern} OR p.first_name ILIKE ${pattern}
                OR p.middle_name ILIKE ${pattern} OR u.login ILIKE ${pattern}
                OR p.email ILIKE ${pattern})`);
        }
        if (filter.departmentId !== undefined) {
            conditions.push(sql.fragment`p.department_id = ${filter.departmentId}`);
        }
        if (filter.isActive !== undefined) {
            conditions.push(sql.fragment`u.is_active = ${filter.isActive}`);
        }
        const where = sql.fragment`WHERE ${sql.join(conditions, sql.fragment` AND `)}`;
        const offset = (filter.page - 1) * filter.limit;
        const executor = this.tx.executor();

        const rows = await executor.any(sql.unsafe`
            ${EMPLOYEE_SELECT}
            ${where}
            ORDER BY lower(p.last_name), lower(p.first_name), lower(u.login), u.id
            LIMIT ${filter.limit} OFFSET ${offset}`);
        const total = await executor.oneFirst(sql.unsafe`
            SELECT count(*)::int
            FROM auth_users u
            LEFT JOIN auth_user_profiles p ON p.user_id = u.id
            ${where}`);
        return { items: rows.map(toEmployee), total: z.number().parse(total) };
    }

    async findById(userId: string): Promise<EmployeeView | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            ${EMPLOYEE_SELECT} WHERE u.id = ${userId}`);
        return row === null ? null : toEmployee(row);
    }

    async listDepartments(): Promise<DepartmentView[]> {
        const rows = await this.tx.executor().any(sql.unsafe`
            ${DEPARTMENT_SELECT} ORDER BY lower(d.name), d.id`);
        return rows.map(toDepartment);
    }

    async findDepartmentById(id: string): Promise<DepartmentView | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            ${DEPARTMENT_SELECT} WHERE d.id = ${id}`);
        return row === null ? null : toDepartment(row);
    }
}
