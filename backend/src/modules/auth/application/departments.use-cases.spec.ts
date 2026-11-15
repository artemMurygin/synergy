/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName, InvalidDepartmentNameError } from '../domain/department-name';
import { EmployeeProfile } from '../domain/employee-profile';
import {
    DepartmentNameTakenError,
    DepartmentNotEmptyError,
    DepartmentNotFoundError,
    EmployeeNotFoundError,
} from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import { CreateDepartmentUseCase } from './create-department.use-case';
import { DeleteDepartmentUseCase } from './delete-department.use-case';
import { ListDepartmentsUseCase } from './list-departments.use-case';
import {
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeUsers,
    NOW,
    fakeTx,
} from './test-doubles';
import { UpdateDepartmentUseCase } from './update-department.use-case';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    const query = new FakeEmployeeQuery(users, profiles, departments);
    return {
        users,
        profiles,
        departments,
        list: new ListDepartmentsUseCase(query),
        create: new CreateDepartmentUseCase(departments, users, query, fakeTx),
        update: new UpdateDepartmentUseCase(departments, users, query, fakeTx),
        remove: new DeleteDepartmentUseCase(departments, fakeTx),
    };
}

function addEmployee(
    users: FakeUsers,
    profiles: FakeProfiles,
    id: string,
    departmentId?: string,
    isActive = true,
    name = { lastName: 'Иванов', firstName: 'Иван' },
) {
    users.byId.set(
        id,
        User.restore({
            id,
            login: Login.of(id),
            passwordHash: PasswordHash.of('h'),
            mustChangePassword: false,
            isActive,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    profiles.byUserId.set(
        id,
        EmployeeProfile.create({ userId: id, name: PersonName.of(name), departmentId }),
    );
}

function addDepartment(
    departments: FakeDepartments,
    id: string,
    name: string,
    headUserId?: string,
) {
    departments.byId.set(id, Department.create({ id, name: DepartmentName.of(name), headUserId }));
}

describe('ListDepartmentsUseCase', () => {
    it('returns departments by name with employee count and head full name', async () => {
        const { users, profiles, departments, list } = setup();
        addEmployee(users, profiles, 'boss', 'd2', true, { lastName: 'Петров', firstName: 'Пётр' });
        addEmployee(users, profiles, 'e1', 'd2', false);
        addDepartment(departments, 'd1', 'Яблоки');
        addDepartment(departments, 'd2', 'Арбузы', 'boss');

        const result = await list.execute();

        expect(result.map((d) => d.name)).toEqual(['Арбузы', 'Яблоки']);
        expect(result[0]).toMatchObject({
            id: 'd2',
            employeeCount: 2,
            head: { id: 'boss', fullName: 'Петров Пётр', isActive: true },
        });
        expect(result[1]).toMatchObject({ employeeCount: 0, head: null });
    });
});

describe('CreateDepartmentUseCase', () => {
    it('creates a department without a head', async () => {
        const { departments, create } = setup();
        const view = await create.execute({ name: ' Колл-центр 1 ' });
        expect(view).toMatchObject({ name: 'Колл-центр 1', head: null, employeeCount: 0 });
        expect(departments.byId.get(view.id)?.headUserId).toBeUndefined();
    });

    it('creates a department with an existing employee as head', async () => {
        const { users, profiles, create } = setup();
        addEmployee(users, profiles, 'boss');
        const view = await create.execute({ name: 'QA', headUserId: 'boss' });
        expect(view.head).toMatchObject({ id: 'boss' });
    });

    it('rejects a taken name case-insensitively with 409 and saves nothing', async () => {
        const { departments, create } = setup();
        addDepartment(departments, 'd1', 'QA');
        await expect(create.execute({ name: 'qa' })).rejects.toBeInstanceOf(
            DepartmentNameTakenError,
        );
        expect(departments.byId.size).toBe(1);
    });

    it('rejects an unknown head with 404 and saves nothing', async () => {
        const { departments, create } = setup();
        await expect(create.execute({ name: 'QA', headUserId: 'ghost' })).rejects.toBeInstanceOf(
            EmployeeNotFoundError,
        );
        expect(departments.save).not.toHaveBeenCalled();
    });

    it('rejects an empty name', async () => {
        const { create } = setup();
        await expect(create.execute({ name: '  ' })).rejects.toBeInstanceOf(
            InvalidDepartmentNameError,
        );
    });
});

describe('UpdateDepartmentUseCase', () => {
    it('renames the department', async () => {
        const { departments, update } = setup();
        addDepartment(departments, 'd1', 'QA');
        const view = await update.execute('d1', { name: 'Тестирование' });
        expect(view.name).toBe('Тестирование');
    });

    it('allows keeping its own name', async () => {
        const { departments, update } = setup();
        addDepartment(departments, 'd1', 'QA');
        await expect(update.execute('d1', { name: 'qa' })).resolves.toMatchObject({ id: 'd1' });
    });

    it('changes the head', async () => {
        const { users, profiles, departments, update } = setup();
        addEmployee(users, profiles, 'a');
        addEmployee(users, profiles, 'b');
        addDepartment(departments, 'd1', 'QA', 'a');
        const view = await update.execute('d1', { headUserId: 'b' });
        expect(view.head).toMatchObject({ id: 'b' });
    });

    it('clears the head with null', async () => {
        const { users, profiles, departments, update } = setup();
        addEmployee(users, profiles, 'a');
        addDepartment(departments, 'd1', 'QA', 'a');
        const view = await update.execute('d1', { headUserId: null });
        expect(view.head).toBeNull();
        expect(departments.byId.get('d1')?.headUserId).toBeUndefined();
    });

    it('keeps the head when headUserId is omitted', async () => {
        const { users, profiles, departments, update } = setup();
        addEmployee(users, profiles, 'a');
        addDepartment(departments, 'd1', 'QA', 'a');
        await update.execute('d1', { name: 'Dev' });
        expect(departments.byId.get('d1')?.headUserId).toBe('a');
    });

    it('rejects a name of another department with 409 and changes nothing', async () => {
        const { departments, update } = setup();
        addDepartment(departments, 'd1', 'QA');
        addDepartment(departments, 'd2', 'Dev');
        await expect(update.execute('d1', { name: 'dev' })).rejects.toBeInstanceOf(
            DepartmentNameTakenError,
        );
        expect(departments.byId.get('d1')?.name.value).toBe('QA');
    });

    it('rejects an unknown head with 404 and changes nothing', async () => {
        const { departments, update } = setup();
        addDepartment(departments, 'd1', 'QA');
        await expect(update.execute('d1', { headUserId: 'ghost' })).rejects.toBeInstanceOf(
            EmployeeNotFoundError,
        );
        expect(departments.byId.get('d1')?.headUserId).toBeUndefined();
    });

    it('rejects an unknown department with 404', async () => {
        const { update } = setup();
        await expect(update.execute('nope', { name: 'X' })).rejects.toBeInstanceOf(
            DepartmentNotFoundError,
        );
    });
});

describe('DeleteDepartmentUseCase', () => {
    it('deletes an empty department together with its head link', async () => {
        const { users, profiles, departments, remove } = setup();
        addEmployee(users, profiles, 'boss');
        addDepartment(departments, 'd1', 'QA', 'boss');
        await remove.execute('d1');
        expect(departments.byId.has('d1')).toBe(false);
        expect(users.byId.has('boss')).toBe(true);
    });

    it('refuses with DEPARTMENT_NOT_EMPTY when an employee belongs to it', async () => {
        const { users, profiles, departments, remove } = setup();
        addEmployee(users, profiles, 'e1', 'd1');
        addDepartment(departments, 'd1', 'QA');
        await expect(remove.execute('d1')).rejects.toBeInstanceOf(DepartmentNotEmptyError);
        expect(departments.byId.has('d1')).toBe(true);
    });

    it('counts a dismissed employee as well', async () => {
        const { users, profiles, departments, remove } = setup();
        addEmployee(users, profiles, 'e1', 'd1', false);
        addDepartment(departments, 'd1', 'QA');
        await expect(remove.execute('d1')).rejects.toBeInstanceOf(DepartmentNotEmptyError);
    });

    it('rejects an unknown department with 404', async () => {
        const { remove } = setup();
        await expect(remove.execute('nope')).rejects.toBeInstanceOf(DepartmentNotFoundError);
    });
});
