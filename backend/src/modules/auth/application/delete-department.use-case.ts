import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DepartmentNotEmptyError, DepartmentNotFoundError } from '../domain/errors';
import { DepartmentRepository } from '../domain/ports/department-repository.port';

/** Deletes an empty department; dismissed employees count as members. */
@Injectable()
export class DeleteDepartmentUseCase {
    constructor(
        private readonly departments: DepartmentRepository,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(departmentId: string): Promise<void> {
        await this.tx.run(async () => {
            if ((await this.departments.findById(departmentId)) === null) {
                throw new DepartmentNotFoundError();
            }
            if ((await this.departments.countEmployees(departmentId)) > 0) {
                throw new DepartmentNotEmptyError();
            }
            await this.departments.delete(departmentId);
        });
    }
}
