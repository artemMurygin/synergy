import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Department } from '../domain/department';
import { DepartmentName, InvalidDepartmentNameError } from '../domain/department-name';
import { Email, InvalidEmailError } from '../domain/email';
import { InvalidLoginError, Login } from '../domain/login';
import type { PasswordHash } from '../domain/password-hash';
import { InvalidPersonNameError, PersonName } from '../domain/person-name';
import { Clock } from '../domain/ports/clock.port';
import { DepartmentRepository } from '../domain/ports/department-repository.port';
import { PasswordGenerator } from '../domain/ports/password-generator.port';
import { PasswordHasher } from '../domain/ports/password-hasher.port';
import { UserProfileRepository } from '../domain/ports/user-profile-repository.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import { InvalidRoleError, Role } from '../domain/role';
import { User } from '../domain/user';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { ProvisionEmployee } from './provision-employee';

export const MAX_POSITION_LENGTH = 200;
export const MAX_SCRM_EMPLOYEE_ID_LENGTH = 64;

export interface SeedDepartmentEntry {
    id: string;
    name: string;
    /** Login of the head: an employee of the same file or an existing one. */
    head?: string;
}

export interface SeedUserEntry {
    login: string;
    /** Without a last and first name the entry is a legacy one: a user without a profile. */
    lastName?: string;
    firstName?: string;
    middleName?: string;
    departmentId?: string;
    position?: string;
    email?: string;
    scrmEmployeeId?: string;
    password?: string;
    /** Raw role names; an unknown one aborts the run before anything is written. */
    roles?: string[];
}

export interface SeedInput {
    departments: SeedDepartmentEntry[];
    users: SeedUserEntry[];
}

export interface SeedResult {
    departments: { created: string[]; skipped: string[] };
    users: { created: { login: string; generatedPassword?: string }[]; skipped: string[] };
}

/** The file is checked as a whole; nothing was written. */
export class SeedValidationError extends Error {
    constructor(readonly problems: string[]) {
        super(`Seed file is invalid:\n- ${problems.join('\n- ')}`);
    }
}

const VALUE_OBJECT_ERRORS = [
    InvalidLoginError,
    InvalidRoleError,
    InvalidPersonNameError,
    InvalidEmailError,
    InvalidDepartmentNameError,
];

interface PlannedDepartment {
    id: string;
    name: DepartmentName;
    head?: Login;
}

interface PlannedUser {
    login: Login;
    name?: PersonName;
    departmentId?: string;
    position?: string;
    email?: Email;
    scrmEmployeeId?: string;
    roles: Role[];
    password?: string;
}

interface Credentials {
    passwordHash: PasswordHash;
    generatedPassword?: string;
}

function blankToUndefined(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    return value === undefined || value.length === 0 ? undefined : value;
}

/**
 * Initial load of departments and employees from a file. "Only new" mode: an existing
 * department (by id) or employee (by login) is skipped entirely. The file is validated as a
 * whole and passwords are hashed before the transaction; the writes then happen in one
 * transaction: departments, employees, then heads.
 */
@Injectable()
export class SeedDirectoryUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly profiles: UserProfileRepository,
        private readonly departments: DepartmentRepository,
        private readonly provision: ProvisionEmployee,
        private readonly hasher: PasswordHasher,
        private readonly generator: PasswordGenerator,
        private readonly clock: Clock,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async execute(input: SeedInput): Promise<SeedResult> {
        const problems: string[] = [];
        const plannedDepartments = this.planDepartments(input.departments, problems);
        const plannedUsers = this.planUsers(input.users, problems);

        const existingDepartments = new Set<string>();
        const newDepartments: PlannedDepartment[] = [];
        for (const department of plannedDepartments) {
            if ((await this.departments.findById(department.id)) !== null) {
                existingDepartments.add(department.id);
            } else {
                newDepartments.push(department);
            }
        }
        const existingUserIds = new Map<string, string>();
        const newUsers: PlannedUser[] = [];
        for (const user of plannedUsers) {
            const found = await this.users.findByLogin(user.login);
            if (found !== null) existingUserIds.set(user.login.value, found.id);
            else newUsers.push(user);
        }

        await this.checkReferences({
            plannedDepartments,
            plannedUsers,
            newDepartments,
            newUsers,
            existingUserIds,
            problems,
        });
        if (problems.length > 0) throw new SeedValidationError(problems);

        const credentials = await this.prepareCredentials(newUsers);
        return this.tx.run(() =>
            this.write({
                plannedDepartments,
                plannedUsers,
                newDepartments,
                newUsers,
                existingUserIds,
                credentials,
            }),
        );
    }

    private planDepartments(
        entries: SeedDepartmentEntry[],
        problems: string[],
    ): PlannedDepartment[] {
        const planned: PlannedDepartment[] = [];
        const ids = new Set<string>();
        const names = new Set<string>();
        for (const entry of entries) {
            const label = `department "${entry.id}"`;
            const id = entry.id.trim();
            if (id.length === 0) problems.push('department: id must not be empty');
            else if (ids.has(id)) problems.push(`${label}: duplicate id`);
            ids.add(id);
            const name = this.guard(label, problems, () => DepartmentName.of(entry.name));
            if (name !== undefined) {
                const key = name.value.toLowerCase();
                if (names.has(key)) problems.push(`${label}: duplicate name "${name.value}"`);
                names.add(key);
            }
            const headRaw = blankToUndefined(entry.head);
            const head =
                headRaw === undefined
                    ? undefined
                    : this.guard(label, problems, () => Login.of(headRaw));
            if (id.length > 0 && name !== undefined) {
                planned.push({ id, name, ...(head === undefined ? {} : { head }) });
            }
        }
        return planned;
    }

    private planUsers(entries: SeedUserEntry[], problems: string[]): PlannedUser[] {
        const planned: PlannedUser[] = [];
        const logins = new Set<string>();
        const emails = new Set<string>();
        for (const entry of entries) {
            const label = `user "${entry.login}"`;
            const login = this.guard(label, problems, () => Login.of(entry.login));
            if (login === undefined) continue;
            if (logins.has(login.value)) problems.push(`${label}: duplicate login`);
            logins.add(login.value);

            const roles = this.guard(label, problems, () => [
                ...new Set((entry.roles ?? []).map((role) => Role.of(role))),
            ]);
            const hasName = entry.lastName !== undefined || entry.firstName !== undefined;
            const name = hasName
                ? this.guard(label, problems, () =>
                      PersonName.of({
                          lastName: entry.lastName ?? '',
                          firstName: entry.firstName ?? '',
                          middleName: entry.middleName,
                      }),
                  )
                : undefined;
            const email = this.guard(label, problems, () => Email.optional(entry.email));
            if (email !== undefined) {
                if (emails.has(email.value))
                    problems.push(`${label}: duplicate email ${email.value}`);
                emails.add(email.value);
            }
            const departmentId = blankToUndefined(entry.departmentId);
            const position = blankToUndefined(entry.position);
            const scrmEmployeeId = blankToUndefined(entry.scrmEmployeeId);
            if (position !== undefined && position.length > MAX_POSITION_LENGTH) {
                problems.push(
                    `${label}: position is longer than ${String(MAX_POSITION_LENGTH)} characters`,
                );
            }
            if (
                scrmEmployeeId !== undefined &&
                scrmEmployeeId.length > MAX_SCRM_EMPLOYEE_ID_LENGTH
            ) {
                problems.push(
                    `${label}: scrmEmployeeId is longer than ${String(MAX_SCRM_EMPLOYEE_ID_LENGTH)} characters`,
                );
            }
            const profileFieldGiven =
                departmentId !== undefined ||
                position !== undefined ||
                email !== undefined ||
                scrmEmployeeId !== undefined ||
                blankToUndefined(entry.middleName) !== undefined;
            if (!hasName && profileFieldGiven) {
                problems.push(`${label}: last name and first name are required for a profile`);
            }
            planned.push({
                login,
                roles: roles ?? [],
                ...(name === undefined ? {} : { name }),
                ...(departmentId === undefined ? {} : { departmentId }),
                ...(position === undefined ? {} : { position }),
                ...(email === undefined ? {} : { email }),
                ...(scrmEmployeeId === undefined ? {} : { scrmEmployeeId }),
                ...(entry.password === undefined ? {} : { password: entry.password }),
            });
        }
        return planned;
    }

    private async checkReferences(ctx: {
        plannedDepartments: PlannedDepartment[];
        plannedUsers: PlannedUser[];
        newDepartments: PlannedDepartment[];
        newUsers: PlannedUser[];
        existingUserIds: Map<string, string>;
        problems: string[];
    }): Promise<void> {
        const { problems } = ctx;
        const fileDepartments = new Set(ctx.plannedDepartments.map((d) => d.id));
        const fileLogins = new Set(ctx.plannedUsers.map((u) => u.login.value));

        for (const department of ctx.newDepartments) {
            if (await this.departments.isNameTaken(department.name)) {
                problems.push(
                    `department "${department.id}": name "${department.name.value}" is already taken`,
                );
            }
        }
        for (const department of ctx.plannedDepartments) {
            const head = department.head;
            if (head === undefined || fileLogins.has(head.value)) continue;
            if (!(await this.users.existsByLogin(head))) {
                problems.push(`department "${department.id}": unknown head "${head.value}"`);
            }
        }
        for (const user of ctx.newUsers) {
            const label = `user "${user.login.value}"`;
            if (
                user.departmentId !== undefined &&
                !fileDepartments.has(user.departmentId) &&
                (await this.departments.findById(user.departmentId)) === null
            ) {
                problems.push(`${label}: unknown department "${user.departmentId}"`);
            }
            if (user.email !== undefined && (await this.profiles.isEmailTaken(user.email))) {
                problems.push(`${label}: email ${user.email.value} already belongs to an employee`);
            }
        }
    }

    private async prepareCredentials(newUsers: PlannedUser[]): Promise<Map<string, Credentials>> {
        const prepared = new Map<string, Credentials>();
        for (const user of newUsers) {
            const generatedPassword =
                user.password === undefined ? this.generator.generate() : undefined;
            const passwordHash = await this.hasher.hash(user.password ?? generatedPassword ?? '');
            prepared.set(
                user.login.value,
                generatedPassword === undefined
                    ? { passwordHash }
                    : { passwordHash, generatedPassword },
            );
        }
        return prepared;
    }

    private async write(ctx: {
        plannedDepartments: PlannedDepartment[];
        plannedUsers: PlannedUser[];
        newDepartments: PlannedDepartment[];
        newUsers: PlannedUser[];
        existingUserIds: Map<string, string>;
        credentials: Map<string, Credentials>;
    }): Promise<SeedResult> {
        const result: SeedResult = {
            departments: { created: [], skipped: [] },
            users: { created: [], skipped: [] },
        };
        const createdIds = new Set(ctx.newDepartments.map((d) => d.id));
        const createdDepartments = new Map<string, Department>();
        for (const planned of ctx.plannedDepartments) {
            if (!createdIds.has(planned.id)) {
                result.departments.skipped.push(planned.id);
                continue;
            }
            const department = Department.create({ id: planned.id, name: planned.name });
            await this.departments.save(department);
            createdDepartments.set(planned.id, department);
            result.departments.created.push(planned.id);
        }

        const userIds = new Map(ctx.existingUserIds);
        const newLogins = new Set(ctx.newUsers.map((u) => u.login.value));
        for (const planned of ctx.plannedUsers) {
            if (!newLogins.has(planned.login.value)) {
                result.users.skipped.push(planned.login.value);
                continue;
            }
            const credentials = ctx.credentials.get(planned.login.value);
            if (credentials === undefined) throw new Error('Credentials were not prepared');
            userIds.set(planned.login.value, await this.createUser(planned, credentials));
            result.users.created.push(
                credentials.generatedPassword === undefined
                    ? { login: planned.login.value }
                    : {
                          login: planned.login.value,
                          generatedPassword: credentials.generatedPassword,
                      },
            );
        }

        for (const planned of ctx.plannedDepartments) {
            const department = createdDepartments.get(planned.id);
            if (department === undefined || planned.head === undefined) continue;
            const headId =
                userIds.get(planned.head.value) ?? (await this.users.findByLogin(planned.head))?.id;
            if (headId === undefined) continue;
            department.assignHead(headId);
            await this.departments.save(department);
        }
        return result;
    }

    private async createUser(planned: PlannedUser, credentials: Credentials): Promise<string> {
        if (planned.name !== undefined) {
            const created = await this.provision.execute({
                login: planned.login,
                name: planned.name,
                departmentId: planned.departmentId,
                position: planned.position,
                email: planned.email,
                scrmEmployeeId: planned.scrmEmployeeId,
                roles: planned.roles,
                credentials,
            });
            return created.userId;
        }
        const user = User.createWithTemporaryPassword({
            id: randomUUID(),
            login: planned.login,
            passwordHash: credentials.passwordHash,
            now: this.clock.now(),
        });
        await this.users.save(user);
        if (planned.roles.length > 0) await this.users.assignRoles(user.id, planned.roles);
        return user.id;
    }

    private guard<T>(label: string, problems: string[], build: () => T): T | undefined {
        try {
            return build();
        } catch (error) {
            if (VALUE_OBJECT_ERRORS.some((type) => error instanceof type)) {
                problems.push(`${label}: ${(error as Error).message}`);
                return undefined;
            }
            throw error;
        }
    }
}
