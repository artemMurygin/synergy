import { Injectable } from '@nestjs/common';
import type { EmployeeView } from '../domain/employee-view';
import { EmployeeNotFoundError } from '../domain/errors';
import { EmployeeQuery } from '../domain/ports/employee-query.port';

@Injectable()
export class GetEmployeeUseCase {
    constructor(private readonly employees: EmployeeQuery) {}

    async execute(userId: string): Promise<EmployeeView> {
        const employee = await this.employees.findById(userId);
        if (employee === null) throw new EmployeeNotFoundError();
        return employee;
    }
}
