import { Injectable } from '@nestjs/common';
import type { EmployeeView } from '../domain/employee-view';
import { EmployeeNotFoundError } from '../domain/errors';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import { Role } from '../domain/role';
import { ActiveAdminGuard } from './active-admin-guard';

/** Replaces the whole role set of an employee; keeps at least one active admin. */
@Injectable()
export class ReplaceEmployeeRolesUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly guard: ActiveAdminGuard,
        private readonly employees: EmployeeQuery,
    ) {}

    async execute(userId: string, rawRoles: string[]): Promise<EmployeeView> {
        // An unknown role rejects the request before anything is touched.
        const roles = [...new Set(rawRoles.map((role) => Role.of(role)))];
        // The guard runs the change and the check under the admin lock in one transaction.
        await this.guard.run(async () => {
            if ((await this.users.findById(userId)) === null) throw new EmployeeNotFoundError();
            await this.users.replaceRoles(userId, roles);
        });
        const employee = await this.employees.findById(userId);
        if (employee === null) throw new EmployeeNotFoundError();
        return employee;
    }
}
