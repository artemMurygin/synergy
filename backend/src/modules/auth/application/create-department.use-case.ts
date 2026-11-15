import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Department } from '../domain/department';
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

export interface CreateDepartmentInput {
    name: string;
    headUserId?: string;
}

@Injectable()
export class CreateDepartmentUseCase {
    constructor(
        private readonly departments: DepartmentRepository,
        private readonly users: UserRepository,
        private readonly employees: EmployeeQuery,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(input: CreateDepartmentInput): Promise<DepartmentView> {
        const name = DepartmentName.of(input.name);
        return this.tx.run(async () => {
            if (await this.departments.isNameTaken(name)) throw new DepartmentNameTakenError();
            if (
                input.headUserId !== undefined &&
                (await this.users.findById(input.headUserId)) === null
            ) {
                throw new EmployeeNotFoundError();
            }
            const department = Department.create({
                id: randomUUID(),
                name,
                headUserId: input.headUserId,
            });
            await this.departments.save(department);
            const view = await this.employees.findDepartmentById(department.id);
            if (view === null) throw new DepartmentNotFoundError();
            return view;
        });
    }
}
