/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { EmployeeProfile } from '../domain/employee-profile';
import { EmployeeNotFoundError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import { GetEmployeeUseCase } from './get-employee.use-case';
import { ListEmployeesUseCase } from './list-employees.use-case';
import { FakeDepartments, FakeEmployeeQuery, FakeProfiles, FakeUsers, NOW } from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    const query = new FakeEmployeeQuery(users, profiles, departments);
    return {
        users,
        profiles,
        query,
        list: new ListEmployeesUseCase(query),
        get: new GetEmployeeUseCase(query),
    };
}

function add(
    users: FakeUsers,
    profiles: FakeProfiles,
    id: string,
    lastName: string,
    isActive = true,
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
        EmployeeProfile.create({ userId: id, name: PersonName.of({ lastName, firstName: 'Имя' }) }),
    );
}

describe('ListEmployeesUseCase', () => {
    it('passes search, filters, limit and page to the query', async () => {
        const { query, list } = setup();
        const filter = { search: 'иван', departmentId: 'd1', isActive: false, limit: 10, page: 2 };
        await list.execute(filter);
        expect(query.list).toHaveBeenCalledWith(filter);
    });

    it('returns active and dismissed employees when isActive is not set', async () => {
        const { users, profiles, list } = setup();
        add(users, profiles, 'a', 'Иванов');
        add(users, profiles, 'b', 'Петров', false);
        const result = await list.execute({ limit: 20, page: 1 });
        expect(result.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
        expect(result.total).toBe(2);
        expect(result.limit).toBe(20);
        expect(result.page).toBe(1);
    });

    it('returns only dismissed ones when asked', async () => {
        const { users, profiles, list } = setup();
        add(users, profiles, 'a', 'Иванов');
        add(users, profiles, 'b', 'Петров', false);
        const result = await list.execute({ isActive: false, limit: 20, page: 1 });
        expect(result.items.map((i) => i.id)).toEqual(['b']);
    });
});

describe('GetEmployeeUseCase', () => {
    it('returns the employee card', async () => {
        const { users, profiles, get } = setup();
        add(users, profiles, 'a', 'Иванов');
        expect((await get.execute('a')).fullName).toBe('Иванов Имя');
    });

    it('throws EmployeeNotFoundError for an unknown id', async () => {
        const { get } = setup();
        await expect(get.execute('missing')).rejects.toBeInstanceOf(EmployeeNotFoundError);
    });
});
