/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { AuthSession } from '../domain/auth-session';
import { EmployeeNotFoundError, LastAdminError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import type { Role } from '../domain/role';
import { User } from '../domain/user';
import { ActiveAdminGuard } from './active-admin-guard';
import { DismissEmployeeUseCase } from './dismiss-employee.use-case';
import {
    FakeAdminLock,
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeSessions,
    FakeUsers,
    NOW,
    fakeTx,
} from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const sessions = new FakeSessions();
    const profiles = new FakeProfiles();
    const query = new FakeEmployeeQuery(users, profiles, new FakeDepartments(profiles));
    const guard = new ActiveAdminGuard(users, new FakeAdminLock(), fakeTx);
    return { users, sessions, useCase: new DismissEmployeeUseCase(users, sessions, guard, query) };
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

function addSession(sessions: FakeSessions, id: string, userId: string) {
    const session = AuthSession.restore({
        id,
        userId,
        createdAt: NOW,
        revokedAt: null,
        tokens: [],
    });
    sessions.byId.set(id, session);
    return session;
}

describe('DismissEmployeeUseCase', () => {
    it('deactivates the employee and revokes all their sessions in one transaction', async () => {
        const { users, sessions, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', ['developer']);
        const inTx: boolean[] = [];
        users.setActive.mockImplementationOnce((id: string, active: boolean) => {
            inTx.push(fakeTx.isInTransaction());
            const user = users.byId.get(id);
            if (user && !active) user.deactivate();
            return Promise.resolve();
        });
        sessions.revokeAllForUser.mockImplementationOnce(() => {
            inTx.push(fakeTx.isInTransaction());
            return Promise.resolve();
        });

        const view = await useCase.execute('ivan');

        expect(view.isActive).toBe(false);
        expect(users.setActive).toHaveBeenCalledWith('ivan', false);
        expect(sessions.revokeAllForUser).toHaveBeenCalledWith('ivan');
        expect(inTx).toEqual([true, true]);
    });

    it('locks sessions before the user row, like the password change does', async () => {
        const { users, sessions, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', []);
        const order: string[] = [];
        sessions.revokeAllForUser.mockImplementationOnce(() => {
            order.push('sessions');
            return Promise.resolve();
        });
        users.setActive.mockImplementationOnce(() => {
            order.push('user');
            return Promise.resolve();
        });

        await useCase.execute('ivan');

        expect(order).toEqual(['sessions', 'user']);
    });

    it('actually revokes the sessions of the employee only', async () => {
        const { users, sessions, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', []);
        addUser(users, 'petr', []);
        const mine = addSession(sessions, 's1', 'ivan');
        const other = addSession(sessions, 's2', 'petr');

        await useCase.execute('ivan');

        expect(mine.isRevoked()).toBe(true);
        expect(other.isRevoked()).toBe(false);
    });

    it('refuses to dismiss the last active admin and leaves them active', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);

        await expect(useCase.execute('a')).rejects.toBeInstanceOf(LastAdminError);
    });

    it('allows dismissing an admin while a second active admin exists', async () => {
        const { users, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'b', ['admin']);

        const view = await useCase.execute('a');

        expect(view.isActive).toBe(false);
    });

    it('is idempotent: a repeated dismissal succeeds without changes', async () => {
        const { users, sessions, useCase } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'ivan', [], false);

        const view = await useCase.execute('ivan');

        expect(view.isActive).toBe(false);
        expect(users.setActive).not.toHaveBeenCalled();
        expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects an unknown employee with EmployeeNotFoundError', async () => {
        const { useCase } = setup();

        await expect(useCase.execute('ghost')).rejects.toBeInstanceOf(EmployeeNotFoundError);
    });
});
