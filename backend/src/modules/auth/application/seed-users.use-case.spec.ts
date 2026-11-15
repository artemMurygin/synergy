/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it, vi } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { Email } from '../domain/email';
import { EmployeeProfile } from '../domain/employee-profile';
import { Login } from '../domain/login';
import { PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import { PasswordHash } from '../domain/password-hash';
import { ProvisionEmployee } from './provision-employee';
import { SeedDirectoryUseCase, SeedValidationError, type SeedInput } from './seed-users.use-case';
import {
    FakeDepartments,
    FakeProfiles,
    FakeUsers,
    fakeClock,
    fakeHasher,
    fakeTx,
} from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    let n = 0;
    const generator = { generate: () => `generated-${String((n += 1))}` };
    const provision = new ProvisionEmployee(
        users,
        profiles,
        departments,
        fakeHasher,
        generator,
        fakeClock,
    );
    const useCase = new SeedDirectoryUseCase(
        users,
        profiles,
        departments,
        provision,
        fakeHasher,
        generator,
        fakeClock,
        fakeTx,
    );
    fakeHasher.hash.mockClear();
    return { useCase, users, profiles, departments };
}

type Setup = ReturnType<typeof setup>;

const person = (login: string, extra: Record<string, unknown> = {}) => ({
    login,
    lastName: 'Иванов',
    firstName: 'Иван',
    ...extra,
});

const fullFile = (): SeedInput => ({
    departments: [
        { id: 'dev', name: 'Разработка', head: 'ivan' },
        { id: 'qa', name: 'Тестирование', head: 'anna' },
    ],
    users: [
        person('ivan', {
            departmentId: 'dev',
            email: 'ivan@example.com',
            password: 'given-pass-1',
        }),
        person('anna', { lastName: 'Петрова', firstName: 'Анна', departmentId: 'qa' }),
        person('boris', { departmentId: 'dev', roles: ['admin'] }),
    ],
});

function snapshot({ users, profiles, departments }: Setup) {
    return {
        users: users.byId.size,
        profiles: profiles.byUserId.size,
        departments: departments.byId.size,
        roles: [...users.roles.values()].flat().length,
        hashes: fakeHasher.hash.mock.calls.length,
    };
}

async function expectRejectedWithoutWrites(s: Setup, input: SeedInput, message?: RegExp) {
    const before = snapshot(s);
    const error = await s.useCase.execute(input).then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SeedValidationError);
    if (message !== undefined) expect((error as Error).message).toMatch(message);
    expect(snapshot(s)).toEqual(before);
}

describe('SeedDirectoryUseCase', () => {
    describe('first load', () => {
        it('creates departments, employees with profiles and heads', async () => {
            const s = setup();

            const result = await s.useCase.execute(fullFile());

            expect(result.departments.created).toEqual(['dev', 'qa']);
            expect(result.users.created.map((u) => u.login)).toEqual(['ivan', 'anna', 'boris']);
            const ivan = await s.users.findByLogin(Login.of('ivan'));
            expect(ivan?.mustChangePassword).toBe(true);
            expect(ivan?.passwordHash.value).toBe('hash:given-pass-1');
            const profile = s.profiles.byUserId.get(ivan?.id ?? '');
            expect(profile?.departmentId).toBe('dev');
            expect(profile?.email?.value).toBe('ivan@example.com');
            const anna = await s.users.findByLogin(Login.of('anna'));
            expect(s.departments.byId.get('dev')?.headUserId).toBe(ivan?.id);
            expect(s.departments.byId.get('qa')?.headUserId).toBe(anna?.id);
        });

        it('creates a department head that belongs to the department it heads (no cycle problem)', async () => {
            const s = setup();

            await s.useCase.execute({
                departments: [{ id: 'd', name: 'D', head: 'chief' }],
                users: [person('chief', { departmentId: 'd' })],
            });

            const chief = await s.users.findByLogin(Login.of('chief'));
            expect(s.departments.byId.get('d')?.headUserId).toBe(chief?.id);
            expect(s.profiles.byUserId.get(chief?.id ?? '')?.departmentId).toBe('d');
        });

        it('assigns roles to a newly created employee', async () => {
            const s = setup();

            await s.useCase.execute(fullFile());

            const boris = await s.users.findByLogin(Login.of('boris'));
            expect(s.users.roles.get(boris?.id ?? '')).toEqual(['admin']);
        });

        it('prints a generated password once and stores only its hash', async () => {
            const s = setup();

            const result = await s.useCase.execute(fullFile());

            const anna = result.users.created.find((u) => u.login === 'anna');
            expect(anna?.generatedPassword).toBe('generated-1');
            expect(result.users.created.find((u) => u.login === 'ivan')?.generatedPassword).toBe(
                undefined,
            );
            const user = await s.users.findByLogin(Login.of('anna'));
            expect(user?.passwordHash.value).toBe('hash:generated-1');
            expect(user?.mustChangePassword).toBe(true);
        });
    });

    describe('legacy entries without a profile', () => {
        it('creates only the user and its roles', async () => {
            const s = setup();

            const result = await s.useCase.execute({
                departments: [],
                users: [
                    { login: 'Dev', password: 'p-1', roles: ['developer'] },
                    { login: 'plain' },
                ],
            });

            expect(result.users.created.map((u) => u.login)).toEqual(['dev', 'plain']);
            const dev = await s.users.findByLogin(Login.of('dev'));
            expect(dev?.mustChangePassword).toBe(true);
            expect(s.users.roles.get(dev?.id ?? '')).toEqual(['developer']);
            expect(s.profiles.byUserId.size).toBe(0);
        });
    });

    describe('only-new mode', () => {
        async function existing(s: Setup) {
            const user = User.createWithTemporaryPassword({
                id: 'u-ivan',
                login: Login.of('ivan'),
                passwordHash: PasswordHash.of('hash:admin-set'),
                now: fakeClock.now(),
            });
            await s.users.save(user);
            await s.users.replaceRoles('u-ivan', []);
            await s.profiles.save(
                EmployeeProfile.create({
                    userId: 'u-ivan',
                    name: PersonName.of({ lastName: 'Сидоров', firstName: 'Сидор' }),
                    departmentId: 'dev',
                }),
            );
            await s.departments.save(
                Department.create({ id: 'dev', name: DepartmentName.of('Разработка (правка)') }),
            );
            s.users.save.mockClear();
            s.profiles.save.mockClear();
            s.departments.save.mockClear();
            s.users.assignRoles.mockClear();
        }

        it('reports everything as skipped on a repeated run and changes nothing', async () => {
            const s = setup();
            await s.useCase.execute(fullFile());
            s.users.save.mockClear();
            s.profiles.save.mockClear();
            s.departments.save.mockClear();
            s.users.assignRoles.mockClear();

            const result = await s.useCase.execute(fullFile());

            expect(result.departments).toEqual({ created: [], skipped: ['dev', 'qa'] });
            expect(result.users).toEqual({ created: [], skipped: ['ivan', 'anna', 'boris'] });
            expect(s.users.save).not.toHaveBeenCalled();
            expect(s.profiles.save).not.toHaveBeenCalled();
            expect(s.departments.save).not.toHaveBeenCalled();
            expect(s.users.assignRoles).not.toHaveBeenCalled();
        });

        it('keeps profile, password, roles and department of an existing employee', async () => {
            const s = setup();
            await existing(s);

            const result = await s.useCase.execute({
                departments: [{ id: 'dev', name: 'Другое название', head: 'ivan' }],
                users: [
                    person('ivan', {
                        lastName: 'Новая',
                        departmentId: 'qa',
                        roles: ['admin'],
                        password: 'other-pass-1',
                    }),
                    person('new-one', { departmentId: 'dev' }),
                ],
            });

            expect(result.users.skipped).toEqual(['ivan']);
            expect(result.users.created.map((u) => u.login)).toEqual(['new-one']);
            expect(s.users.byId.get('u-ivan')?.passwordHash.value).toBe('hash:admin-set');
            expect(s.users.roles.get('u-ivan')).toEqual([]);
            expect(s.profiles.byUserId.get('u-ivan')?.name.lastName).toBe('Сидоров');
            expect(s.profiles.byUserId.get('u-ivan')?.departmentId).toBe('dev');
            expect(s.departments.byId.get('dev')?.name.value).toBe('Разработка (правка)');
            expect(s.departments.byId.get('dev')?.headUserId).toBeUndefined();
        });

        it('does not hash passwords of skipped employees', async () => {
            const s = setup();
            await existing(s);

            await s.useCase.execute({
                departments: [],
                users: [person('ivan', { password: 'ignored-1' })],
            });

            expect(fakeHasher.hash).not.toHaveBeenCalled();
        });

        it('allows a head and a department that already exist', async () => {
            const s = setup();
            await existing(s);

            await s.useCase.execute({
                departments: [{ id: 'new', name: 'Новый', head: 'ivan' }],
                users: [],
            });

            expect(s.departments.byId.get('new')?.headUserId).toBe('u-ivan');
        });

        it('assigns a new employee to an existing department', async () => {
            const s = setup();
            await existing(s);

            await s.useCase.execute({
                departments: [],
                users: [person('fresh', { departmentId: 'dev' })],
            });

            const fresh = await s.users.findByLogin(Login.of('fresh'));
            expect(s.profiles.byUserId.get(fresh?.id ?? '')?.departmentId).toBe('dev');
        });
    });

    describe('validation of the whole file before the first write', () => {
        it('rejects an unknown department', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(
                s,
                { departments: [], users: [person('a'), person('b', { departmentId: 'ghost' })] },
                /ghost/,
            );
        });

        it('rejects an unknown head', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(
                s,
                { departments: [{ id: 'd', name: 'D', head: 'nobody' }], users: [person('a')] },
                /nobody/,
            );
        });

        it('rejects an unknown role', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(
                s,
                {
                    departments: [],
                    users: [
                        person('ok', { roles: ['developer'] }),
                        person('bad', { roles: ['root'] }),
                    ],
                },
                /root/,
            );
        });

        it('rejects a duplicate login in the file regardless of case', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(
                s,
                { departments: [], users: [person('Ivan'), person('ivan ')] },
                /ivan/,
            );
        });

        it('rejects a duplicate email in the file', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(
                s,
                {
                    departments: [],
                    users: [
                        person('a', { email: 'x@example.com' }),
                        person('b', { email: 'X@Example.com' }),
                    ],
                },
                /x@example\.com/,
            );
        });

        it('rejects an email that belongs to an existing employee', async () => {
            const s = setup();
            await s.profiles.save(
                EmployeeProfile.create({
                    userId: 'u-old',
                    name: PersonName.of({ lastName: 'Старый', firstName: 'Сотрудник' }),
                    email: Email.of('taken@example.com'),
                }),
            );
            await expectRejectedWithoutWrites(
                s,
                {
                    departments: [],
                    users: [person('a'), person('b', { email: 'taken@example.com' })],
                },
                /taken@example\.com/,
            );
        });

        it('rejects a duplicate department id and a duplicate department name', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(s, {
                departments: [
                    { id: 'd', name: 'A' },
                    { id: 'd', name: 'B' },
                ],
                users: [],
            });
            await expectRejectedWithoutWrites(s, {
                departments: [
                    { id: 'a', name: 'Одинаковое' },
                    { id: 'b', name: 'одинаковое' },
                ],
                users: [],
            });
        });

        it('rejects a new department whose name is taken by an existing one', async () => {
            const s = setup();
            await s.departments.save(
                Department.create({ id: 'old', name: DepartmentName.of('Разработка') }),
            );
            await expectRejectedWithoutWrites(s, {
                departments: [{ id: 'new', name: 'разработка' }],
                users: [],
            });
        });

        it.each([
            ['last name', { lastName: 'я'.repeat(201) }],
            ['first name', { firstName: 'я'.repeat(201) }],
            ['middle name', { middleName: 'я'.repeat(201) }],
            ['position', { position: 'я'.repeat(201) }],
            ['scrm id', { scrmEmployeeId: 's'.repeat(65) }],
            ['email', { email: `${'a'.repeat(250)}@example.com` }],
            ['login', { login: 'l'.repeat(65) }],
            ['empty last name', { lastName: '  ' }],
        ])('rejects a too long or empty %s', async (_label, extra) => {
            const s = setup();
            await expectRejectedWithoutWrites(s, {
                departments: [],
                users: [person('ok'), person('bad', extra)],
            });
        });

        it('rejects a too long department name', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(s, {
                departments: [{ id: 'd', name: 'я'.repeat(201) }],
                users: [person('ok')],
            });
        });

        it('rejects profile fields without a name', async () => {
            const s = setup();
            await expectRejectedWithoutWrites(s, {
                departments: [],
                users: [{ login: 'a', position: 'Тестировщик' }],
            });
        });

        it('reports every problem of the file, not only the first one', async () => {
            const s = setup();
            const error = await s.useCase
                .execute({
                    departments: [{ id: 'd', name: 'D', head: 'nobody' }],
                    users: [person('a', { departmentId: 'ghost' })],
                })
                .catch((e: unknown) => e);

            expect(error).toBeInstanceOf(SeedValidationError);
            expect((error as SeedValidationError).problems).toHaveLength(2);
        });
    });

    describe('transaction and hashing', () => {
        it('hashes before the transaction and writes inside one', async () => {
            const s = setup();
            const hashedInTx: boolean[] = [];
            fakeHasher.hash.mockImplementationOnce((plain: string) => {
                hashedInTx.push(fakeTx.isInTransaction());
                return Promise.resolve(PasswordHash.of(`hash:${plain}`));
            });
            const savedInTx: boolean[] = [];
            const saveUser = s.users.save.getMockImplementation();
            s.users.save.mockImplementation((user: User) => {
                savedInTx.push(fakeTx.isInTransaction());
                return saveUser?.(user) ?? Promise.resolve();
            });
            const saveDepartment = s.departments.save.getMockImplementation();
            s.departments.save.mockImplementation((d: Department) => {
                savedInTx.push(fakeTx.isInTransaction());
                return saveDepartment?.(d) ?? Promise.resolve();
            });

            await s.useCase.execute(fullFile());

            expect(hashedInTx).toEqual([false]);
            expect(savedInTx.length).toBeGreaterThan(0);
            expect(savedInTx.every(Boolean)).toBe(true);
            expect(fakeHasher.hash).toHaveBeenCalledTimes(3);
        });

        it('runs the whole write phase in a single transaction', async () => {
            const s = setup();
            const run = vi.spyOn(fakeTx, 'run');

            await s.useCase.execute(fullFile());

            expect(run).toHaveBeenCalledTimes(1);
            run.mockRestore();
        });

        it('propagates a failure in the middle so the transaction rolls back', async () => {
            const s = setup();
            let calls = 0;
            const original = s.users.save.getMockImplementation();
            s.users.save.mockImplementation((user: User) => {
                calls += 1;
                if (calls === 2) return Promise.reject(new Error('db down'));
                return original?.(user) ?? Promise.resolve();
            });

            await expect(s.useCase.execute(fullFile())).rejects.toThrow('db down');
            // The error leaves the transaction callback, which is what makes the real runner roll back.
            expect(fakeTx.isInTransaction()).toBe(false);
        });
    });
});
