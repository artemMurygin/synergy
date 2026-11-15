import { describe, expect, it } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { Email } from '../domain/email';
import { EmployeeProfile } from '../domain/employee-profile';
import { InvalidCredentialsError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import { FakeDepartments, FakeEmployeeQuery, FakeProfiles, FakeUsers, NOW } from './test-doubles';

function setup(): {
    useCase: GetCurrentUserUseCase;
    users: FakeUsers;
    profiles: FakeProfiles;
    departments: FakeDepartments;
} {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    users.byId.set(
        'u1',
        User.restore({
            id: 'u1',
            login: Login.of('ivan'),
            passwordHash: PasswordHash.of('h'),
            mustChangePassword: false,
            isActive: true,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    const query = new FakeEmployeeQuery(users, profiles, departments);
    return { useCase: new GetCurrentUserUseCase(users, query), users, profiles, departments };
}

function addDepartment(departments: FakeDepartments, id: string, name: string): void {
    departments.byId.set(id, Department.restore({ id, name: DepartmentName.of(name) }));
}

function profileOf(departmentId?: string): EmployeeProfile {
    return EmployeeProfile.create({
        userId: 'u1',
        name: PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' }),
        departmentId,
        position: 'Аналитик',
        email: Email.of('ivan@example.com'),
        scrmEmployeeId: 'scrm-1',
    });
}

describe('GetCurrentUserUseCase', () => {
    it('returns the roles taken from the token claims', async () => {
        const { useCase } = setup();

        const profile = await useCase.execute('u1', ['developer']);

        expect(profile.roles).toEqual(['developer']);
        expect(profile).toMatchObject({ id: 'u1', login: 'ivan', mustChangePassword: false });
    });

    it('returns an empty list for a user without roles', async () => {
        const { useCase } = setup();

        expect((await useCase.execute('u1', [])).roles).toEqual([]);
    });

    it('does not read roles from the database', async () => {
        const { useCase, users } = setup();
        users.roles.set('u1', ['developer']);

        const profile = await useCase.execute('u1', []);

        expect(profile.roles).toEqual([]);
        expect(users.findRoles).not.toHaveBeenCalled();
    });

    it('returns the full name, name parts, position and department', async () => {
        const { useCase, profiles, departments } = setup();
        addDepartment(departments, 'd1', 'Разработка');
        profiles.byUserId.set('u1', profileOf('d1'));

        const profile = await useCase.execute('u1', []);

        expect(profile).toEqual({
            id: 'u1',
            login: 'ivan',
            mustChangePassword: false,
            roles: [],
            fullName: 'Иванов Иван Петрович',
            lastName: 'Иванов',
            firstName: 'Иван',
            middleName: 'Петрович',
            position: 'Аналитик',
            department: { id: 'd1', name: 'Разработка' },
        });
    });

    it('uses the login as the full name for a user without a profile', async () => {
        const { useCase } = setup();

        const profile = await useCase.execute('u1', []);

        expect(profile).toMatchObject({
            fullName: 'ivan',
            lastName: null,
            firstName: null,
            middleName: null,
            position: null,
            department: null,
        });
    });

    it('returns an empty department for a user without one', async () => {
        const { useCase, profiles } = setup();
        profiles.byUserId.set('u1', profileOf());

        expect((await useCase.execute('u1', [])).department).toBeNull();
    });

    it('shows a changed profile on the next call without signing in again', async () => {
        const { useCase, profiles, departments } = setup();
        addDepartment(departments, 'd1', 'Разработка');
        addDepartment(departments, 'd2', 'Продажи');
        profiles.byUserId.set('u1', profileOf('d1'));
        await useCase.execute('u1', []);

        const stored = profiles.byUserId.get('u1');
        stored?.applyPatch({ departmentId: 'd2', lastName: 'Сидоров' });
        const profile = await useCase.execute('u1', []);

        expect(profile.department).toEqual({ id: 'd2', name: 'Продажи' });
        expect(profile.lastName).toBe('Сидоров');
        expect(profile.fullName).toBe('Сидоров Иван Петрович');
    });

    it('does not return the email or the SCRM id', async () => {
        const { useCase, profiles } = setup();
        profiles.byUserId.set('u1', profileOf());

        const profile = await useCase.execute('u1', []);

        expect(profile).not.toHaveProperty('email');
        expect(profile).not.toHaveProperty('scrmEmployeeId');
    });

    it('rejects an inactive or missing user', async () => {
        const { useCase } = setup();

        await expect(useCase.execute('missing', [])).rejects.toBeInstanceOf(
            InvalidCredentialsError,
        );
    });
});
