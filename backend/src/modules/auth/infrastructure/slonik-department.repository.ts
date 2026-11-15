import { Injectable } from '@nestjs/common';
import {
    ForeignKeyIntegrityConstraintViolationError,
    sql,
    UniqueIntegrityConstraintViolationError,
} from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import {
    DepartmentNameTakenError,
    DepartmentNotEmptyError,
    EmployeeNotFoundError,
} from '../domain/errors';
import { DepartmentRepository } from '../domain/ports/department-repository.port';

const NAME_INDEX = 'auth_departments_name_lower_idx';
const PROFILE_DEPARTMENT_FK = 'auth_user_profiles_department_id_fkey';
const HEAD_FK = 'auth_departments_head_user_id_fkey';

function isProfileDepartmentRestrict(error: unknown): boolean {
    if (error instanceof ForeignKeyIntegrityConstraintViolationError) {
        return error.constraint === PROFILE_DEPARTMENT_FK;
    }
    const cause: unknown = error instanceof Error && 'cause' in error ? error.cause : error;
    const pg = (cause ?? error) as { code?: unknown; constraint?: unknown };
    return pg.code === '23001' && pg.constraint === PROFILE_DEPARTMENT_FK;
}

const departmentRow = z.object({
    id: z.string(),
    name: z.string(),
    head_user_id: z.string().nullable(),
});

@Injectable()
export class SlonikDepartmentRepository extends DepartmentRepository {
    constructor(private readonly tx: TransactionRunnerPort) {
        super();
    }

    async findById(id: string): Promise<Department | null> {
        const raw = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT id, name, head_user_id FROM auth_departments WHERE id = ${id}`);
        if (raw === null) return null;
        const row = departmentRow.parse(raw);
        return Department.restore({
            id: row.id,
            name: DepartmentName.of(row.name),
            headUserId: row.head_user_id ?? undefined,
        });
    }

    async save(department: Department): Promise<void> {
        try {
            await this.tx.executor().query(sql.unsafe`
                INSERT INTO auth_departments (id, name, head_user_id)
                VALUES (${department.id}, ${department.name.value}, ${department.headUserId ?? null})
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    head_user_id = EXCLUDED.head_user_id`);
        } catch (error) {
            if (
                error instanceof UniqueIntegrityConstraintViolationError &&
                error.constraint === NAME_INDEX
            ) {
                throw new DepartmentNameTakenError();
            }
            if (
                error instanceof ForeignKeyIntegrityConstraintViolationError &&
                error.constraint === HEAD_FK
            ) {
                throw new EmployeeNotFoundError();
            }
            throw error;
        }
    }

    async isNameTaken(name: DepartmentName, exceptId?: string): Promise<boolean> {
        const except =
            exceptId === undefined ? sql.fragment`TRUE` : sql.fragment`id <> ${exceptId}`;
        return this.tx.executor().exists(sql.unsafe`
            SELECT 1 FROM auth_departments
            WHERE lower(name) = lower(${name.value}) AND ${except}`);
    }

    async countEmployees(departmentId: string): Promise<number> {
        const count = await this.tx.executor().oneFirst(sql.unsafe`
            SELECT count(*)::int FROM auth_user_profiles WHERE department_id = ${departmentId}`);
        return z.number().parse(count);
    }

    async delete(id: string): Promise<void> {
        try {
            await this.tx.executor().query(sql.unsafe`
                DELETE FROM auth_departments WHERE id = ${id}`);
        } catch (error) {
            // ON DELETE RESTRICT raises 23001 (restrict_violation), which Slonik leaves unwrapped.
            if (isProfileDepartmentRestrict(error)) {
                throw new DepartmentNotEmptyError();
            }
            throw error;
        }
    }
}
