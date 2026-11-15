/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { InvalidEmailError } from '../domain/email';
import { DepartmentNotFoundError, EmailTakenError, LoginTakenError } from '../domain/errors';
import { InvalidLoginError } from '../domain/login';
import { InvalidPersonNameError } from '../domain/person-name';
import { InvalidRoleError } from '../domain/role';
import { CreateEmployeeUseCase } from './create-employee.use-case';
import { ProvisionEmployee } from './provision-employee';
import {
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeUsers,
    fakeClock,
    fakeHasher,
    fakeTx,
} from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    const query = new FakeEmployeeQuery(users, profiles, departments);
    let n = 0;
    const generator = { generate: () => `generated-${String((n += 1))}` };
    const provision = new ProvisionEmployee(
        users,
        profiles,
        departments,
        fakeHasher,
        generator,
        fakeClock,
    );
    const useCase = new CreateEmployeeUseCase(provision, query, fakeTx);
    return { users, profiles, departments, useCase };
}

const base = { login: 'ivan', lastName: 'Иванов', firstName: 'Иван' };

function expectNothingCreated(users: FakeUsers, profiles: FakeProfiles): void {
    expect(users.byId.size).toBe(0);
    expect(profiles.byUserId.size).toBe(0);
    expect(users.roles.size).toBe(0);
}

describe('CreateEmployeeUseCase', () => {
    it('returns the employee together with the temporary password', async () => {
        const { useCase } = setup();

        const result = await useCase.execute(base);

        expect(result.temporaryPassword).toBe('generated-1');
        expect(result.employee).toMatchObject({
            login: 'ivan',
            isActive: true,
            mustChangePassword: true,
            fullName: 'Иванов Иван',
            roles: [],
            department: null,
        });
    });

    it('does not put the password into the employee view', async () => {
        const { useCase } = setup();

        const result = await useCase.execute(base);

        expect(JSON.stringify(result.employee)).not.toContain('generated-1');
    });

    it('creates the employee with a department and roles', async () => {
        const { useCase, departments } = setup();
        departments.byId.set('d1', Department.create({ id: 'd1', name: DepartmentName.of('QA') }));

        const result = await useCase.execute({
            ...base,
            middleName: 'Петрович',
            departmentId: 'd1',
            position: 'Тестировщик',
            email: 'Ivan@Example.com',
            scrmEmployeeId: 'scrm-1',
            roles: ['developer'],
        });

        expect(result.employee).toMatchObject({
            fullName: 'Иванов Иван Петрович',
            department: { id: 'd1', name: 'QA' },
            position: 'Тестировщик',
            email: 'ivan@example.com',
            scrmEmployeeId: 'scrm-1',
            roles: ['developer'],
        });
    });

    it('rejects a duplicate login with 409 semantics', async () => {
        const { useCase, users } = setup();
        await useCase.execute(base);

        await expect(useCase.execute({ ...base, login: 'IVAN' })).rejects.toBeInstanceOf(
            LoginTakenError,
        );
        expect(users.byId.size).toBe(1);
    });

    it('rejects a duplicate email with 409 semantics', async () => {
        const { useCase, users } = setup();
        await useCase.execute({ ...base, email: 'a@example.com' });

        await expect(
            useCase.execute({ ...base, login: 'petr', email: 'A@example.com' }),
        ).rejects.toBeInstanceOf(EmailTakenError);
        expect(users.byId.size).toBe(1);
    });

    it('rejects an unknown department with 404 semantics and creates nothing', async () => {
        const { useCase, users, profiles } = setup();

        await expect(useCase.execute({ ...base, departmentId: 'nope' })).rejects.toBeInstanceOf(
            DepartmentNotFoundError,
        );
        expectNothingCreated(users, profiles);
    });

    it.each([
        ['empty last name', { lastName: '   ' }],
        ['empty first name', { firstName: '' }],
        ['too long last name', { lastName: 'я'.repeat(201) }],
        ['too long first name', { firstName: 'я'.repeat(201) }],
        ['too long middle name', { middleName: 'я'.repeat(201) }],
    ])('rejects %s and creates nothing', async (_label, patch) => {
        const { useCase, users, profiles } = setup();

        await expect(useCase.execute({ ...base, ...patch })).rejects.toBeInstanceOf(
            InvalidPersonNameError,
        );
        expectNothingCreated(users, profiles);
    });

    it('rejects an invalid or too long login and creates nothing', async () => {
        const { useCase, users, profiles } = setup();

        await expect(useCase.execute({ ...base, login: '  ' })).rejects.toBeInstanceOf(
            InvalidLoginError,
        );
        await expect(useCase.execute({ ...base, login: 'a'.repeat(65) })).rejects.toBeInstanceOf(
            InvalidLoginError,
        );
        expectNothingCreated(users, profiles);
    });

    it('rejects an invalid email and an unknown role and creates nothing', async () => {
        const { useCase, users, profiles } = setup();

        await expect(useCase.execute({ ...base, email: 'not-an-email' })).rejects.toBeInstanceOf(
            InvalidEmailError,
        );
        await expect(useCase.execute({ ...base, roles: ['boss'] })).rejects.toBeInstanceOf(
            InvalidRoleError,
        );
        expectNothingCreated(users, profiles);
    });

    it('does not hash a password when validation fails', async () => {
        const { useCase } = setup();
        fakeHasher.hash.mockClear();

        await expect(useCase.execute({ ...base, lastName: '' })).rejects.toBeInstanceOf(
            InvalidPersonNameError,
        );
        expect(fakeHasher.hash).not.toHaveBeenCalled();
    });
});
