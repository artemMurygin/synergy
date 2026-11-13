import { describe, expect, it } from 'vitest';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import { FakeUsers, NOW } from './test-doubles';

function setup(): { useCase: GetCurrentUserUseCase; users: FakeUsers } {
    const users = new FakeUsers();
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
    return { useCase: new GetCurrentUserUseCase(users), users };
}

describe('GetCurrentUserUseCase', () => {
    it('returns the roles taken from the token claims', async () => {
        const { useCase } = setup();

        const profile = await useCase.execute('u1', ['developer']);

        expect(profile).toEqual({
            id: 'u1',
            login: 'ivan',
            mustChangePassword: false,
            roles: ['developer'],
        });
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
});
