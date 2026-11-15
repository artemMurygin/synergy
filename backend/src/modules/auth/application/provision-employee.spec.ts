/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { Email } from '../domain/email';
import { DepartmentNotFoundError, EmailTakenError, LoginTakenError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import { ProvisionEmployee } from './provision-employee';
import { FakeDepartments, FakeProfiles, FakeUsers, fakeClock, fakeHasher } from './test-doubles';

function setup() {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    let n = 0;
    const generator = { generate: () => `generated-${String((n += 1))}` };
    const service = new ProvisionEmployee(
        users,
        profiles,
        departments,
        fakeHasher,
        generator,
        fakeClock,
    );
    return { users, profiles, departments, service };
}

const name = () => PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' });

describe('ProvisionEmployee', () => {
    it('creates an active user that must change the password, with a profile', async () => {
        const { users, profiles, service } = setup();

        const result = await service.execute({
            login: Login.of('Ivan'),
            name: name(),
            position: 'Тестировщик',
            email: Email.of('Ivan@Example.com'),
            scrmEmployeeId: 'scrm-1',
            roles: [],
        });

        const user = users.byId.get(result.userId);
        expect(user?.login.value).toBe('ivan');
        expect(user?.mustChangePassword).toBe(true);
        expect(user?.isActive).toBe(true);
        const profile = profiles.byUserId.get(result.userId);
        expect(profile?.name.lastName).toBe('Иванов');
        expect(profile?.position).toBe('Тестировщик');
        expect(profile?.email?.value).toBe('ivan@example.com');
        expect(profile?.scrmEmployeeId).toBe('scrm-1');
    });

    it('generates a temporary password and returns it when none is given', async () => {
        const { users, service } = setup();

        const result = await service.execute({ login: Login.of('anna'), name: name(), roles: [] });

        expect(result.generatedPassword).toBe('generated-1');
        expect(users.byId.get(result.userId)?.passwordHash.value).toBe('hash:generated-1');
    });

    it('uses the given password and does not generate one', async () => {
        const { users, service } = setup();

        const result = await service.execute({
            login: Login.of('anna'),
            name: name(),
            roles: [],
            password: 'given-pass-1',
        });

        expect(result.generatedPassword).toBeUndefined();
        expect(users.byId.get(result.userId)?.passwordHash.value).toBe('hash:given-pass-1');
    });

    it('assigns the roles', async () => {
        const { users, service } = setup();

        const result = await service.execute({
            login: Login.of('anna'),
            name: name(),
            roles: ['developer', 'admin'],
        });

        expect(await users.findRoles(result.userId)).toEqual(['developer', 'admin']);
    });

    it('puts the employee into an existing department', async () => {
        const { profiles, departments, service } = setup();
        departments.byId.set('d1', Department.create({ id: 'd1', name: DepartmentName.of('QA') }));

        const result = await service.execute({
            login: Login.of('anna'),
            name: name(),
            departmentId: 'd1',
            roles: [],
        });

        expect(profiles.byUserId.get(result.userId)?.departmentId).toBe('d1');
    });

    it('rejects a taken login and writes nothing', async () => {
        const { users, profiles, service } = setup();
        await service.execute({ login: Login.of('anna'), name: name(), roles: [] });

        await expect(
            service.execute({
                login: Login.of('ANNA'),
                name: name(),
                email: Email.of('new@example.com'),
                roles: ['admin'],
            }),
        ).rejects.toBeInstanceOf(LoginTakenError);
        expect(users.byId.size).toBe(1);
        expect(profiles.byUserId.size).toBe(1);
    });

    it('rejects a taken email and writes nothing', async () => {
        const { users, profiles, service } = setup();
        await service.execute({
            login: Login.of('anna'),
            name: name(),
            email: Email.of('a@example.com'),
            roles: [],
        });

        await expect(
            service.execute({
                login: Login.of('boris'),
                name: name(),
                email: Email.of('A@example.com'),
                roles: [],
            }),
        ).rejects.toBeInstanceOf(EmailTakenError);
        expect(users.byId.size).toBe(1);
        expect(profiles.byUserId.size).toBe(1);
    });

    it('rejects an unknown department and writes nothing', async () => {
        const { users, profiles, service } = setup();

        await expect(
            service.execute({
                login: Login.of('anna'),
                name: name(),
                departmentId: 'missing',
                roles: [],
            }),
        ).rejects.toBeInstanceOf(DepartmentNotFoundError);
        expect(users.byId.size).toBe(0);
        expect(profiles.byUserId.size).toBe(0);
    });

    it('uses prepared credentials without hashing or generating again', async () => {
        const { users, service } = setup();
        fakeHasher.hash.mockClear();

        const result = await service.execute({
            login: Login.of('prepared'),
            name: name(),
            roles: [],
            credentials: { passwordHash: PasswordHash.of('hash:ready'), generatedPassword: 'pw-1' },
        });

        expect(fakeHasher.hash).not.toHaveBeenCalled();
        expect(users.byId.get(result.userId)?.passwordHash.value).toBe('hash:ready');
        expect(result.generatedPassword).toBe('pw-1');
    });
});
