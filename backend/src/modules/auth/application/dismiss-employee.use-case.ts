import { Injectable } from '@nestjs/common';
import type { EmployeeView } from '../domain/employee-view';
import { EmployeeNotFoundError } from '../domain/errors';
import { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import { ActiveAdminGuard } from './active-admin-guard';

/**
 * Dismisses an employee: deactivation and revocation of every refresh session in one
 * transaction. Idempotent; refuses to dismiss the last active admin.
 */
@Injectable()
export class DismissEmployeeUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly sessions: AuthSessionRepository,
        private readonly guard: ActiveAdminGuard,
        private readonly employees: EmployeeQuery,
    ) {}

    async execute(userId: string): Promise<EmployeeView> {
        await this.guard.run(async () => {
            const user = await this.users.findById(userId);
            if (user === null) throw new EmployeeNotFoundError();
            if (!user.isActive) return;
            // Sessions first, then the user row: the order of ChangePasswordUseCase, no deadlock.
            await this.sessions.revokeAllForUser(userId);
            await this.users.setActive(userId, false);
        });
        const employee = await this.employees.findById(userId);
        if (employee === null) throw new EmployeeNotFoundError();
        return employee;
    }
}
