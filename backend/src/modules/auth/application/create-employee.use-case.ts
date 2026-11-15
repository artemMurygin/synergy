import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Email } from '../domain/email';
import type { EmployeeView } from '../domain/employee-view';
import { EmployeeNotFoundError } from '../domain/errors';
import { Login } from '../domain/login';
import { PersonName } from '../domain/person-name';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { Role } from '../domain/role';
import { ProvisionEmployee } from './provision-employee';

export interface CreateEmployeeInput {
    login: string;
    lastName: string;
    firstName: string;
    middleName?: string;
    departmentId?: string;
    position?: string;
    email?: string;
    scrmEmployeeId?: string;
    /** Raw role names; an unknown one rejects the whole request. */
    roles?: string[];
}

export interface CreateEmployeeResult {
    employee: EmployeeView;
    /** Shown once; neither stored in plain text nor returned again. */
    temporaryPassword: string;
}

@Injectable()
export class CreateEmployeeUseCase {
    constructor(
        private readonly provision: ProvisionEmployee,
        private readonly employees: EmployeeQuery,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
        // Value objects first: invalid input fails before any hashing or writing.
        const login = Login.of(input.login);
        const name = PersonName.of({
            lastName: input.lastName,
            firstName: input.firstName,
            middleName: input.middleName,
        });
        const email = Email.optional(input.email);
        const roles = [...new Set((input.roles ?? []).map((role) => Role.of(role)))];

        return this.tx.run(async () => {
            const created = await this.provision.execute({
                login,
                name,
                departmentId: emptyToUndefined(input.departmentId),
                position: emptyToUndefined(input.position),
                email,
                scrmEmployeeId: emptyToUndefined(input.scrmEmployeeId),
                roles,
            });
            const employee = await this.employees.findById(created.userId);
            if (employee === null || created.generatedPassword === undefined) {
                throw new EmployeeNotFoundError();
            }
            return { employee, temporaryPassword: created.generatedPassword };
        });
    }
}

function emptyToUndefined(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    return value === undefined || value.length === 0 ? undefined : value;
}
