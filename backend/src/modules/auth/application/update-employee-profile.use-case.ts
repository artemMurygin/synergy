import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { EmployeeProfile, type ProfilePatch } from '../domain/employee-profile';
import type { EmployeeView } from '../domain/employee-view';
import {
    DepartmentNotFoundError,
    EmailTakenError,
    EmployeeNotFoundError,
    ProfileIncompleteError,
} from '../domain/errors';
import { PersonName } from '../domain/person-name';
import { DepartmentRepository } from '../domain/ports/department-repository.port';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserProfileRepository } from '../domain/ports/user-profile-repository.port';
import { UserRepository } from '../domain/ports/user-repository.port';

/** Edits the profile of an employee, dismissed ones included. The login is not editable. */
@Injectable()
export class UpdateEmployeeProfileUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly profiles: UserProfileRepository,
        private readonly departments: DepartmentRepository,
        private readonly employees: EmployeeQuery,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(userId: string, patch: ProfilePatch): Promise<EmployeeView> {
        return this.tx.run(async () => {
            if ((await this.users.findById(userId)) === null) throw new EmployeeNotFoundError();

            const loaded = await this.profiles.findByUserId(userId);
            // Work on a copy, so a rejected patch never leaks into a shared instance.
            const existing =
                loaded === null
                    ? null
                    : EmployeeProfile.restore({
                          userId,
                          name: loaded.name,
                          departmentId: loaded.departmentId,
                          position: loaded.position,
                          email: loaded.email,
                          scrmEmployeeId: loaded.scrmEmployeeId,
                      });
            // A user without a profile row gets one; the name stays required.
            if (
                existing === null &&
                (patch.lastName === undefined || patch.firstName === undefined)
            ) {
                throw new ProfileIncompleteError();
            }
            const profile =
                existing ??
                EmployeeProfile.create({
                    userId,
                    name: PersonName.of({
                        lastName: patch.lastName ?? '',
                        firstName: patch.firstName ?? '',
                        middleName: patch.middleName,
                    }),
                });
            // Validation of the whole patch happens here, before any lookup or write.
            profile.applyPatch(patch);

            if (
                patch.departmentId !== undefined &&
                profile.departmentId !== undefined &&
                (await this.departments.findById(profile.departmentId)) === null
            ) {
                throw new DepartmentNotFoundError();
            }
            if (
                patch.email !== undefined &&
                profile.email !== undefined &&
                (await this.profiles.isEmailTaken(profile.email, userId))
            ) {
                throw new EmailTakenError();
            }

            await this.profiles.save(profile);
            return this.view(userId);
        });
    }

    private async view(userId: string): Promise<EmployeeView> {
        const employee = await this.employees.findById(userId);
        if (employee === null) throw new EmployeeNotFoundError();
        return employee;
    }
}
