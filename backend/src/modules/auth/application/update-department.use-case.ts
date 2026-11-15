import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DepartmentName } from '../domain/department-name';
import type { DepartmentView } from '../domain/department-view';
import {
    DepartmentNameTakenError,
    DepartmentNotFoundError,
    EmployeeNotFoundError,
} from '../domain/errors';
import { DepartmentRepository } from '../domain/ports/department-repository.port';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserRepository } from '../domain/ports/user-repository.port';

/** An omitted field stays as is; `headUserId: null` clears the head. */
export interface UpdateDepartmentPatch {
    name?: string;
    headUserId?: string | null;
}

@Injectable()
export class UpdateDepartmentUseCase {
    constructor(
        private readonly departments: DepartmentRepository,
        private readonly users: UserRepository,
        private readonly employees: EmployeeQuery,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(departmentId: string, patch: UpdateDepartmentPatch): Promise<DepartmentView> {
        // Validation first: an invalid name fails before any lookup or write.
        const name = patch.name === undefined ? undefined : DepartmentName.of(patch.name);
        return this.tx.run(async () => {
            const department = await this.departments.findById(departmentId);
            if (department === null) throw new DepartmentNotFoundError();

            if (name !== undefined) {
                if (await this.departments.isNameTaken(name, departmentId)) {
                    throw new DepartmentNameTakenError();
                }
                department.rename(name);
            }
            if (patch.headUserId === null) {
                department.clearHead();
            } else if (patch.headUserId !== undefined) {
                if ((await this.users.findById(patch.headUserId)) === null) {
                    throw new EmployeeNotFoundError();
                }
                department.assignHead(patch.headUserId);
            }

            await this.departments.save(department);
            const view = await this.employees.findDepartmentById(departmentId);
            if (view === null) throw new DepartmentNotFoundError();
            return view;
        });
    }
}
