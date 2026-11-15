import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import type { EmployeeView } from '../domain/employee-view';
import { EmployeeNotFoundError } from '../domain/errors';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserRepository } from '../domain/ports/user-repository.port';

/** Returns a dismissed employee; the password and profile stay as they were. Idempotent. */
@Injectable()
export class RestoreEmployeeUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly employees: EmployeeQuery,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(userId: string): Promise<EmployeeView> {
        return this.tx.run(async () => {
            const user = await this.users.findById(userId);
            if (user === null) throw new EmployeeNotFoundError();
            if (!user.isActive) await this.users.setActive(userId, true);
            const employee = await this.employees.findById(userId);
            if (employee === null) throw new EmployeeNotFoundError();
            return employee;
        });
    }
}
