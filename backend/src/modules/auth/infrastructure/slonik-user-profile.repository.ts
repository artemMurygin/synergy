import { Injectable } from '@nestjs/common';
import {
    ForeignKeyIntegrityConstraintViolationError,
    sql,
    UniqueIntegrityConstraintViolationError,
} from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Email } from '../domain/email';
import { EmployeeProfile } from '../domain/employee-profile';
import { DepartmentNotFoundError, EmailTakenError, EmployeeNotFoundError } from '../domain/errors';
import { PersonName } from '../domain/person-name';
import { UserProfileRepository } from '../domain/ports/user-profile-repository.port';

const EMAIL_INDEX = 'auth_user_profiles_email_lower_idx';
const DEPARTMENT_FK = 'auth_user_profiles_department_id_fkey';
const USER_FK = 'auth_user_profiles_user_id_fkey';

const profileRow = z.object({
    user_id: z.string(),
    last_name: z.string().nullable(),
    first_name: z.string().nullable(),
    middle_name: z.string().nullable(),
    department_id: z.string().nullable(),
    position: z.string().nullable(),
    email: z.string().nullable(),
    scrm_employee_id: z.string().nullable(),
});

function toProfile(raw: unknown): EmployeeProfile {
    const row = profileRow.parse(raw);
    return EmployeeProfile.restore({
        userId: row.user_id,
        name: PersonName.of({
            lastName: row.last_name ?? '',
            firstName: row.first_name ?? '',
            middleName: row.middle_name,
        }),
        departmentId: row.department_id ?? undefined,
        position: row.position ?? undefined,
        email: Email.optional(row.email),
        scrmEmployeeId: row.scrm_employee_id ?? undefined,
    });
}

@Injectable()
export class SlonikUserProfileRepository extends UserProfileRepository {
    constructor(private readonly tx: TransactionRunnerPort) {
        super();
    }

    async findByUserId(userId: string): Promise<EmployeeProfile | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT user_id, last_name, first_name, middle_name, department_id, position,
                   email, scrm_employee_id
            FROM auth_user_profiles WHERE user_id = ${userId}`);
        return row === null ? null : toProfile(row);
    }

    async save(profile: EmployeeProfile): Promise<void> {
        try {
            await this.tx.executor().query(sql.unsafe`
                INSERT INTO auth_user_profiles
                    (user_id, last_name, first_name, middle_name, department_id, position,
                     email, scrm_employee_id)
                VALUES (${profile.userId}, ${profile.name.lastName}, ${profile.name.firstName},
                        ${profile.name.middleName ?? null}, ${profile.departmentId ?? null},
                        ${profile.position ?? null}, ${profile.email?.value ?? null},
                        ${profile.scrmEmployeeId ?? null})
                ON CONFLICT (user_id) DO UPDATE SET
                    last_name = EXCLUDED.last_name,
                    first_name = EXCLUDED.first_name,
                    middle_name = EXCLUDED.middle_name,
                    department_id = EXCLUDED.department_id,
                    position = EXCLUDED.position,
                    email = EXCLUDED.email,
                    scrm_employee_id = EXCLUDED.scrm_employee_id`);
        } catch (error) {
            if (
                error instanceof UniqueIntegrityConstraintViolationError &&
                error.constraint === EMAIL_INDEX
            ) {
                throw new EmailTakenError();
            }
            if (error instanceof ForeignKeyIntegrityConstraintViolationError) {
                if (error.constraint === DEPARTMENT_FK) throw new DepartmentNotFoundError();
                if (error.constraint === USER_FK) throw new EmployeeNotFoundError();
            }
            throw error;
        }
    }

    async isEmailTaken(email: Email, exceptUserId?: string): Promise<boolean> {
        const except =
            exceptUserId === undefined
                ? sql.fragment`TRUE`
                : sql.fragment`user_id <> ${exceptUserId}`;
        return this.tx.executor().exists(sql.unsafe`
            SELECT 1 FROM auth_user_profiles WHERE lower(email) = ${email.value} AND ${except}`);
    }
}
