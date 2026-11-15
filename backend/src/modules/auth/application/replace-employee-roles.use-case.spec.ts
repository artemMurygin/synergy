/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { EmployeeNotFoundError, LastAdminError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { InvalidRoleError, type Role } from '../domain/role';
import { User } from '../domain/user';
import { ActiveAdminGuard } from './active-admin-guard';
import { ReplaceEmployeeRolesUseCase } from './replace-employee-roles.use-case';
import {
    FakeAdminLock,
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeUsers,
    NOW,
    fakeTx,
} from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    const query = new FakeEmployeeQuery(users, profiles, departments);
    const lock = new FakeAdminLock();
    const guard = new ActiveAdminGuard(users, lock, fakeTx);
    return { users, lock, useCase: new ReplaceEmployeeRolesUseCase(users, guard, query) };
}

function addUser(users: FakeUsers, id: string, roles: Role[], active = true) {
    users.byId.set(
        id,
        User.restore({
            id,
            login: Login.of(id),
            passwordHash: PasswordHash.of('h'),
            mustChangePassword: false,
            isActive: active,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    users.roles.set(id, roles);
}

describe('ReplaceEmployeeRolesUseCase', () => {
    it('replaces the whole role set', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', ['developer']);

        const view = await useCase.execute('ivan', ['admin']);

        expect(view.roles).toEqual(['admin']);
        expect(users.roles.get('ivan')).toEqual(['admin']);
    });

    it('grants a role to an employee without roles', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', []);

        const view = await useCase.execute('ivan', ['developer']);

        expect(view.roles).toEqual(['developer']);
    });

    it('accepts an empty set and leaves no roles', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', ['developer']);

        const view = await useCase.execute('ivan', []);

        expect(view.roles).toEqual([]);
    });

    it('rejects an unknown role with InvalidRoleError and changes nothing', async () => {
        const { users, useCase } = setup();
        addUser(users, 'ivan', ['developer']);

        await expect(useCase.execute('ivan', ['developer', 'root'])).rejects.toBeInstanceOf(
            InvalidRoleError,
        );
        expect(users.replaceRoles).not.toHaveBeenCalled();
    });

    it('rejects an unknown employee with EmployeeNotFoundError', async () => {
        const { useCase } = setup();

        await expect(useCase.execute('ghost', ['developer'])).rejects.toBeInstanceOf(
            EmployeeNotFoundError,
        );
    });

    it('refuses to remove admin from the last active admin with LastAdminError', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);

        await expect(useCase.execute('a', ['developer'])).rejects.toBeInstanceOf(LastAdminError);
    });

    it('allows removing admin while a second active admin exists', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'b', ['admin']);

        const view = await useCase.execute('a', []);

        expect(view.roles).toEqual([]);
    });

    it('does not count a dismissed admin as the second one', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'b', ['admin'], false);

        await expect(useCase.execute('a', [])).rejects.toBeInstanceOf(LastAdminError);
    });

    it('takes the admin lock when it may reduce the number of admins', async () => {
        const { users, lock, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'b', ['admin']);

        await useCase.execute('a', ['developer']);

        expect(lock.acquire).toHaveBeenCalledTimes(1);
    });
});
