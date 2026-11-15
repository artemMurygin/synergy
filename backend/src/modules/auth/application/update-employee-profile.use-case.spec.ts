/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { Email, InvalidEmailError } from '../domain/email';
import { EmployeeProfile } from '../domain/employee-profile';
import {
    DepartmentNotFoundError,
    EmailTakenError,
    EmployeeNotFoundError,
    ProfileIncompleteError,
} from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { InvalidPersonNameError, PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import {
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeUsers,
    NOW,
    fakeTx,
} from './test-doubles';
import { UpdateEmployeeProfileUseCase } from './update-employee-profile.use-case';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    const query = new FakeEmployeeQuery(users, profiles, departments);
    const useCase = new UpdateEmployeeProfileUseCase(users, profiles, departments, query, fakeTx);
    departments.byId.set('d1', Department.create({ id: 'd1', name: DepartmentName.of('QA') }));
    departments.byId.set('d2', Department.create({ id: 'd2', name: DepartmentName.of('Dev') }));
    return { users, profiles, departments, useCase };
}

function addEmployee(
    users: FakeUsers,
    profiles: FakeProfiles,
    id: string,
    extra: { email?: string; active?: boolean } = {},
) {
    users.byId.set(
        id,
        User.restore({
            id,
            login: Login.of(id),
            passwordHash: PasswordHash.of('h'),
            mustChangePassword: false,
            isActive: extra.active ?? true,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    profiles.byUserId.set(
        id,
        EmployeeProfile.create({
            userId: id,
            name: PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' }),
            departmentId: 'd1',
            position: 'Тестировщик',
            email: extra.email === undefined ? undefined : Email.of(extra.email),
            scrmEmployeeId: 'S-1',
        }),
    );
}

describe('UpdateEmployeeProfileUseCase', () => {
    it('changes the given fields and keeps the omitted ones', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan', { email: 'ivan@example.com' });

        const view = await useCase.execute('ivan', { departmentId: 'd2', position: 'Лид' });

        expect(view).toMatchObject({
            department: { id: 'd2', name: 'Dev' },
            position: 'Лид',
            lastName: 'Иванов',
            firstName: 'Иван',
            middleName: 'Петрович',
            email: 'ivan@example.com',
            scrmEmployeeId: 'S-1',
        });
    });

    it('clears an optional field passed as an empty value', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan', { email: 'ivan@example.com' });

        const view = await useCase.execute('ivan', { email: '', departmentId: null });

        expect(view.email).toBeNull();
        expect(view.department).toBeNull();
        expect(view.position).toBe('Тестировщик');
    });

    it('does not change the login', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan');

        const view = await useCase.execute('ivan', {
            lastName: 'Сидоров',
            login: 'other',
        } as never);

        expect(view.login).toBe('ivan');
        expect(users.byId.get('ivan')?.login.value).toBe('ivan');
    });

    it('rejects an email of another employee with EmailTakenError and changes nothing', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan');
        addEmployee(users, profiles, 'petr', { email: 'petr@example.com' });

        await expect(
            useCase.execute('ivan', { email: 'Petr@Example.com', position: 'Лид' }),
        ).rejects.toBeInstanceOf(EmailTakenError);
        expect(profiles.byUserId.get('ivan')?.position).toBe('Тестировщик');
    });

    it('allows the employee to keep their own email', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan', { email: 'ivan@example.com' });

        const view = await useCase.execute('ivan', { email: 'ivan@example.com' });

        expect(view.email).toBe('ivan@example.com');
    });

    it('rejects an invalid email', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan');

        await expect(useCase.execute('ivan', { email: 'nope' })).rejects.toBeInstanceOf(
            InvalidEmailError,
        );
    });

    it('rejects an unknown department with DepartmentNotFoundError and changes nothing', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan');

        await expect(
            useCase.execute('ivan', { departmentId: 'nope', position: 'Лид' }),
        ).rejects.toBeInstanceOf(DepartmentNotFoundError);
        expect(profiles.byUserId.get('ivan')?.position).toBe('Тестировщик');
        expect(profiles.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown employee with EmployeeNotFoundError', async () => {
        const { useCase } = setup();

        await expect(useCase.execute('ghost', { position: 'x' })).rejects.toBeInstanceOf(
            EmployeeNotFoundError,
        );
    });

    it.each([
        ['last name', { lastName: '   ' }],
        ['first name', { firstName: '' }],
    ])('rejects an empty %s and changes nothing', async (_label, patch) => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan');

        await expect(useCase.execute('ivan', patch)).rejects.toBeInstanceOf(InvalidPersonNameError);
        expect(profiles.save).not.toHaveBeenCalled();
    });

    it('refuses a patch without a name for a user that has no profile (domain error, not 500)', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan');
        profiles.byUserId.delete('ivan');

        await expect(useCase.execute('ivan', { position: 'Оператор' })).rejects.toBeInstanceOf(
            ProfileIncompleteError,
        );
        expect(profiles.save).not.toHaveBeenCalled();
    });

    it('edits a dismissed employee', async () => {
        const { users, profiles, useCase } = setup();
        addEmployee(users, profiles, 'ivan', { active: false });

        const view = await useCase.execute('ivan', { position: 'Архивный' });

        expect(view).toMatchObject({ position: 'Архивный', isActive: false });
    });
});
