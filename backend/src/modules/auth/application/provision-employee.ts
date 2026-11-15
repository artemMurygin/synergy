import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Email } from '../domain/email';
import { EmployeeProfile } from '../domain/employee-profile';
import { DepartmentNotFoundError, EmailTakenError, LoginTakenError } from '../domain/errors';
import type { Login } from '../domain/login';
import type { PasswordHash } from '../domain/password-hash';
import type { PersonName } from '../domain/person-name';
import { Clock } from '../domain/ports/clock.port';
import { DepartmentRepository } from '../domain/ports/department-repository.port';
import { PasswordGenerator } from '../domain/ports/password-generator.port';
import { PasswordHasher } from '../domain/ports/password-hasher.port';
import { UserProfileRepository } from '../domain/ports/user-profile-repository.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import type { Role } from '../domain/role';
import { User } from '../domain/user';

export interface ProvisionEmployeeInput {
    login: Login;
    name: PersonName;
    departmentId?: string;
    position?: string;
    email?: Email;
    scrmEmployeeId?: string;
    roles: Role[];
    /** Temporary password; generated when omitted. Ignored when credentials are given. */
    password?: string;
    /** Hash prepared by the caller (before its transaction), so no hashing happens here. */
    credentials?: { passwordHash: PasswordHash; generatedPassword?: string };
}

export interface ProvisionEmployeeResult {
    userId: string;
    /** Set only when the password was generated here. */
    generatedPassword?: string;
}

/**
 * The single path that creates an employee: user with a temporary password, profile and roles.
 * All checks precede the first write; the caller wraps the call in a transaction.
 */
@Injectable()
export class ProvisionEmployee {
    constructor(
        private readonly users: UserRepository,
        private readonly profiles: UserProfileRepository,
        private readonly departments: DepartmentRepository,
        private readonly hasher: PasswordHasher,
        private readonly generator: PasswordGenerator,
        private readonly clock: Clock,
    ) {}

    async execute(input: ProvisionEmployeeInput): Promise<ProvisionEmployeeResult> {
        if (
            input.departmentId !== undefined &&
            (await this.departments.findById(input.departmentId)) === null
        ) {
            throw new DepartmentNotFoundError();
        }
        if (await this.users.existsByLogin(input.login)) throw new LoginTakenError();
        if (input.email !== undefined && (await this.profiles.isEmailTaken(input.email))) {
            throw new EmailTakenError();
        }

        let generatedPassword: string | undefined;
        let passwordHash: PasswordHash;
        if (input.credentials === undefined) {
            generatedPassword =
                input.password === undefined ? this.generator.generate() : undefined;
            passwordHash = await this.hasher.hash(input.password ?? generatedPassword ?? '');
        } else {
            generatedPassword = input.credentials.generatedPassword;
            passwordHash = input.credentials.passwordHash;
        }
        const user = User.createWithTemporaryPassword({
            id: randomUUID(),
            login: input.login,
            passwordHash,
            now: this.clock.now(),
        });
        await this.users.save(user);
        await this.profiles.save(
            EmployeeProfile.create({
                userId: user.id,
                name: input.name,
                departmentId: input.departmentId,
                position: input.position,
                email: input.email,
                scrmEmployeeId: input.scrmEmployeeId,
            }),
        );
        if (input.roles.length > 0) await this.users.assignRoles(user.id, input.roles);

        return generatedPassword === undefined
            ? { userId: user.id }
            : { userId: user.id, generatedPassword };
    }
}
