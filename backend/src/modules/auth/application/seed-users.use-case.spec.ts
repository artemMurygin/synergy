/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Login } from '../domain/login';
import { SeedUsersUseCase } from './seed-users.use-case';
import { FakeUsers, fakeClock, fakeHasher } from './test-doubles';

function setup() {
    const users = new FakeUsers();
    let n = 0;
    const generator = { generate: () => `generated-${String((n += 1))}` };
    const useCase = new SeedUsersUseCase(users, fakeHasher, generator, fakeClock);
    return { useCase, users };
}

describe('SeedUsersUseCase', () => {
    it('creates users that must change the password', async () => {
        const { useCase, users } = setup();

        const result = await useCase.execute([{ login: 'Ivan', password: 'given-pass-1' }]);

        expect(result.created).toEqual([{ login: 'ivan' }]);
        const user = await users.findByLogin(Login.of('ivan'));
        expect(user?.mustChangePassword).toBe(true);
        expect(user?.passwordHash.value).toBe('hash:given-pass-1');
    });

    it('generates a password when none is given and returns it once', async () => {
        const { useCase, users } = setup();

        const result = await useCase.execute([{ login: 'anna' }]);

        expect(result.created).toEqual([{ login: 'anna', generatedPassword: 'generated-1' }]);
        const user = await users.findByLogin(Login.of('anna'));
        expect(user?.passwordHash.value).toBe('hash:generated-1');
    });

    it('skips an existing login without overwriting it', async () => {
        const { useCase, users } = setup();
        await useCase.execute([{ login: 'ivan', password: 'first-pass-1' }]);
        users.save.mockClear();

        const result = await useCase.execute([
            { login: 'IVAN', password: 'second-pass-2' },
            { login: 'new' },
        ]);

        expect(result.skipped).toEqual(['ivan']);
        expect(result.created.map((c) => c.login)).toEqual(['new']);
        const user = await users.findByLogin(Login.of('ivan'));
        expect(user?.passwordHash.value).toBe('hash:first-pass-1');
        expect(users.save).toHaveBeenCalledTimes(1);
    });
});
