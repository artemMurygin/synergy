/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { LastAdminError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { ActiveAdminGuard } from './active-admin-guard';
import { FakeAdminLock, FakeUsers, NOW, fakeTx } from './test-doubles';

function addUser(users: FakeUsers, id: string, roles: ('admin' | 'developer')[], active = true) {
    const user = User.restore({
        id,
        login: Login.of(id),
        passwordHash: PasswordHash.of('h'),
        mustChangePassword: false,
        isActive: active,
        createdAt: NOW,
        passwordChangedAt: NOW,
    });
    users.byId.set(id, user);
    users.roles.set(id, roles);
    return user;
}

function setup() {
    const users = new FakeUsers();
    const lock = new FakeAdminLock();
    return { users, lock, guard: new ActiveAdminGuard(users, lock, fakeTx) };
}

describe('ActiveAdminGuard', () => {
    it('takes the lock before running the change', async () => {
        const { users, lock, guard } = setup();
        addUser(users, 'a', ['admin']);
        const order: string[] = [];
        lock.acquire.mockImplementation(() => {
            order.push('lock');
            return Promise.resolve();
        });

        await guard.run(() => {
            order.push('change');
            return Promise.resolve();
        });

        expect(order).toEqual(['lock', 'change']);
    });

    it('returns the change result when another active admin remains', async () => {
        const { users, guard } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'b', ['admin']);

        const result = await guard.run(async () => {
            await users.replaceRoles('a', []);
            return 'done';
        });

        expect(result).toBe('done');
    });

    it('throws LastAdminError when the change leaves no active admin', async () => {
        const { users, guard } = setup();
        addUser(users, 'a', ['admin']);

        await expect(
            guard.run(() => users.replaceRoles('a', ['developer'])),
        ).rejects.toBeInstanceOf(LastAdminError);
    });

    it('does not count a dismissed admin', async () => {
        const { users, guard } = setup();
        addUser(users, 'a', ['admin']);
        addUser(users, 'b', ['admin'], false);

        await expect(guard.run(() => users.setActive('a', false))).rejects.toBeInstanceOf(
            LastAdminError,
        );
    });

    it('runs inside a transaction and propagates errors from the change', async () => {
        const { users, guard } = setup();
        addUser(users, 'a', ['admin']);
        let inTx = false;

        await expect(
            guard.run(() => {
                inTx = fakeTx.isInTransaction();
                return Promise.reject(new Error('boom'));
            }),
        ).rejects.toThrow('boom');
        expect(inTx).toBe(true);
    });
});
