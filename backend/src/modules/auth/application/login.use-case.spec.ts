/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { InvalidCredentialsError } from '../domain/errors';
import { LoginUseCase } from './login.use-case';
import {
    FakeSessions,
    FakeUsers,
    NOW,
    fakeClock,
    fakeHasher,
    fakeSettings,
    fakeTokens,
} from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const tokens = fakeTokens();
    users.byId.set(
        'u1',
        User.restore({
            id: 'u1',
            login: Login.of('ivan'),
            passwordHash: PasswordHash.of('hash:secret-pass'),
            mustChangePassword: false,
            isActive: true,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    const useCase = new LoginUseCase(
        users,
        new FakeSessions(),
        fakeHasher,
        tokens.access as never,
        tokens.refresh as never,
        fakeClock,
        fakeSettings,
    );
    return { useCase, users, tokens };
}

describe('LoginUseCase roles', () => {
    it('puts the current roles from the database into the access token', async () => {
        const { useCase, users, tokens } = setup();
        users.roles.set('u1', ['developer']);

        await useCase.execute('ivan', 'secret-pass');

        expect(tokens.access.sign).toHaveBeenCalledWith(
            expect.objectContaining({ sub: 'u1', rol: ['developer'] }),
        );
    });

    it('issues an empty role list for a user without roles', async () => {
        const { useCase, tokens } = setup();

        await useCase.execute('ivan', 'secret-pass');

        expect(tokens.access.sign).toHaveBeenCalledWith(expect.objectContaining({ rol: [] }));
    });
});

describe('LoginUseCase dismissed employee', () => {
    it('refuses a dismissed employee with the right password', async () => {
        const { useCase, users } = setup();
        users.byId.get('u1')?.deactivate();

        await expect(useCase.execute('ivan', 'secret-pass')).rejects.toBeInstanceOf(
            InvalidCredentialsError,
        );
    });
});
