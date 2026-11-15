import { Injectable } from '@nestjs/common';
import type { DepartmentRef } from '../domain/employee-view';
import { InvalidCredentialsError } from '../domain/errors';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import type { Role } from '../domain/role';

export interface CurrentUser {
    id: string;
    login: string;
    mustChangePassword: boolean;
    roles: Role[];
    /** The login for a user without a profile. */
    fullName: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    position: string | null;
    department: DepartmentRef | null;
}

@Injectable()
export class GetCurrentUserUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly employees: EmployeeQuery,
    ) {}

    async execute(userId: string, roles: Role[]): Promise<CurrentUser> {
        const user = await this.users.findById(userId);
        if (user?.canSignIn() !== true) throw new InvalidCredentialsError();
        // The profile is read on every call, so an admin edit shows up without a new sign-in.
        const employee = await this.employees.findById(userId);
        return {
            id: user.id,
            login: user.login.value,
            mustChangePassword: user.mustChangePassword,
            roles,
            fullName: employee?.fullName ?? user.login.value,
            lastName: employee?.lastName ?? null,
            firstName: employee?.firstName ?? null,
            middleName: employee?.middleName ?? null,
            position: employee?.position ?? null,
            department: employee?.department ?? null,
        };
    }
}
