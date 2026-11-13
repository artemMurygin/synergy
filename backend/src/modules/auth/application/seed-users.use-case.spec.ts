/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { InvalidRoleError } from '../domain/role';
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

    describe('roles', () => {
        async function roleOf(users: FakeUsers, login: string): Promise<string[]> {
            const user = await users.findByLogin(Login.of(login));
            return user === null ? [] : users.findRoles(user.id);
        }

        it('assigns developer to a created user', async () => {
            const { useCase, users } = setup();

            await useCase.execute([{ login: 'dev', password: 'p-1', roles: ['developer'] }]);

            expect(await roleOf(users, 'dev')).toEqual(['developer']);
        });

        it('does not duplicate the role on a repeated run', async () => {
            const { useCase, users } = setup();
            const entries = [{ login: 'dev', password: 'p-1', roles: ['developer'] }];

            await useCase.execute(entries);
            await useCase.execute(entries);

            expect(await roleOf(users, 'dev')).toEqual(['developer']);
        });

        it('assigns the role to an already existing user without recreating it', async () => {
            const { useCase, users } = setup();
            await useCase.execute([{ login: 'dev', password: 'p-1' }]);
            users.save.mockClear();

            const result = await useCase.execute([{ login: 'dev', roles: ['developer'] }]);

            expect(result.skipped).toEqual(['dev']);
            expect(users.save).not.toHaveBeenCalled();
            expect(await roleOf(users, 'dev')).toEqual(['developer']);
        });

        it('rejects an unknown role and assigns nothing', async () => {
            const { useCase, users } = setup();

            await expect(
                useCase.execute([
                    { login: 'ok', password: 'p-1', roles: ['developer'] },
                    { login: 'bad', password: 'p-2', roles: ['admin'] },
                ]),
            ).rejects.toBeInstanceOf(InvalidRoleError);

            expect(users.assignRoles).not.toHaveBeenCalled();
            expect(users.save).not.toHaveBeenCalled();
        });

        it('leaves users without roles untouched', async () => {
            const { useCase, users } = setup();

            await useCase.execute([{ login: 'plain', password: 'p-1' }]);

            expect(users.assignRoles).not.toHaveBeenCalled();
            expect(await roleOf(users, 'plain')).toEqual([]);
        });
    });
});
