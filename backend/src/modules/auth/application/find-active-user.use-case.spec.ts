import { beforeEach, describe, expect, it } from 'vitest';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { FindActiveUserUseCase } from './find-active-user.use-case';
import { FakeUsers, NOW } from './test-doubles';

function addUser(users: FakeUsers, id: string, login: string, isActive: boolean): void {
    users.byId.set(
        id,
        User.restore({
            id,
            login: Login.of(login),
            passwordHash: PasswordHash.of('secret-hash'),
            mustChangePassword: true,
            isActive,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
}

describe('FindActiveUserUseCase', () => {
    let users: FakeUsers;
    let useCase: FindActiveUserUseCase;

    beforeEach(() => {
        users = new FakeUsers();
        addUser(users, 'u1', 'ivanov', true);
        addUser(users, 'u2', 'petrov', false);
        useCase = new FindActiveUserUseCase(users);
    });

    it('returns only the id and login of an active user', async () => {
        await expect(useCase.execute('u1')).resolves.toEqual({ id: 'u1', login: 'ivanov' });
    });

    it('returns null for a disabled user', async () => {
        await expect(useCase.execute('u2')).resolves.toBeNull();
    });

    it('returns null for a user that does not exist', async () => {
        await expect(useCase.execute('missing')).resolves.toBeNull();
    });
});
