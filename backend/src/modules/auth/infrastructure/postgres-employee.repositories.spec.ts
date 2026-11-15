import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { Email } from '../domain/email';
import { EmployeeProfile } from '../domain/employee-profile';
import {
    DepartmentNameTakenError,
    DepartmentNotEmptyError,
    EmailTakenError,
} from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import { SlonikDepartmentRepository } from './slonik-department.repository';
import { SlonikUserProfileRepository } from './slonik-user-profile.repository';
import { SlonikUserRepository } from './slonik-user.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-01-01T00:00:00.000Z');

function newUser(login: string): User {
    return User.createWithTemporaryPassword({
        id: randomUUID(),
        login: Login.of(login),
        passwordHash: PasswordHash.of('$argon2id$fake'),
        now: T0,
    });
}

function department(name: string, headUserId?: string): Department {
    return Department.create({
        id: randomUUID(),
        name: DepartmentName.of(name),
        headUserId,
    });
}

type ProfileExtra = Partial<Parameters<typeof EmployeeProfile.create>[0]>;

function profile(userId: string, extra: ProfileExtra = {}): EmployeeProfile {
    return EmployeeProfile.create({
        userId,
        name: PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' }),
        ...extra,
    });
}

describe.skipIf(adminUrl === undefined)('Slonik employee repositories', () => {
    const dbName = `auth_emp_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let tx: TransactionRunner;
    let users: SlonikUserRepository;
    let profiles: SlonikUserProfileRepository;
    let departments: SlonikDepartmentRepository;

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        pool = await createPool(dbUrl);
        tx = new TransactionRunner(pool, new PinoLogger({ pinoHttp: { level: 'silent' } }));
        users = new SlonikUserRepository(pool, tx);
        profiles = new SlonikUserProfileRepository(tx);
        departments = new SlonikDepartmentRepository(tx);
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM auth_user_profiles');
        await client.query('DELETE FROM auth_departments');
        await client.query('DELETE FROM auth_users');
    });

    describe('user profiles', () => {
        it('returns null when the user has no profile row', async () => {
            const user = newUser('ivanov');
            await users.save(user);
            expect(await profiles.findByUserId(user.id)).toBeNull();
        });

        it('save + findByUserId round-trip with every field', async () => {
            const user = newUser('ivanov');
            await users.save(user);
            const dep = department('Разработка');
            await departments.save(dep);
            await profiles.save(
                profile(user.id, {
                    departmentId: dep.id,
                    position: 'Разработчик',
                    email: Email.of('Ivanov@Example.com'),
                    scrmEmployeeId: 'scrm-1',
                }),
            );
            const found = await profiles.findByUserId(user.id);
            expect(found?.name.lastName).toBe('Иванов');
            expect(found?.name.firstName).toBe('Иван');
            expect(found?.name.middleName).toBe('Иванович');
            expect(found?.departmentId).toBe(dep.id);
            expect(found?.position).toBe('Разработчик');
            expect(found?.email?.value).toBe('ivanov@example.com');
            expect(found?.scrmEmployeeId).toBe('scrm-1');
        });

        it('save updates an existing profile and clears optional fields', async () => {
            const user = newUser('ivanov');
            await users.save(user);
            await profiles.save(
                profile(user.id, { position: 'Разработчик', email: Email.of('a@example.com') }),
            );
            const found = await profiles.findByUserId(user.id);
            found?.applyPatch({ lastName: 'Петров', position: null, email: null });
            if (found !== null) await profiles.save(found);
            const updated = await profiles.findByUserId(user.id);
            expect(updated?.name.lastName).toBe('Петров');
            expect(updated?.position).toBeUndefined();
            expect(updated?.email).toBeUndefined();
            const { rows } = await client.query<{ n: number }>(
                'SELECT count(*)::int AS n FROM auth_user_profiles',
            );
            expect(rows[0]?.n).toBe(1);
        });

        it('save does not touch the password hash of the user', async () => {
            const user = newUser('ivanov');
            await users.save(user);
            const before = await client.query('SELECT * FROM auth_users WHERE id = $1', [user.id]);
            await profiles.save(profile(user.id));
            const after = await client.query('SELECT * FROM auth_users WHERE id = $1', [user.id]);
            expect(after.rows[0]).toEqual(before.rows[0]);
        });

        it('save maps a duplicate email to EmailTakenError', async () => {
            const a = newUser('a');
            const b = newUser('b');
            await users.save(a);
            await users.save(b);
            await profiles.save(profile(a.id, { email: Email.of('same@example.com') }));
            await expect(
                profiles.save(profile(b.id, { email: Email.of('SAME@example.com') })),
            ).rejects.toBeInstanceOf(EmailTakenError);
        });

        it('isEmailTaken is case-insensitive and honours exceptUserId', async () => {
            const a = newUser('a');
            const b = newUser('b');
            await users.save(a);
            await users.save(b);
            await profiles.save(profile(a.id, { email: Email.of('a@example.com') }));
            expect(await profiles.isEmailTaken(Email.of('A@Example.com'))).toBe(true);
            expect(await profiles.isEmailTaken(Email.of('a@example.com'), a.id)).toBe(false);
            expect(await profiles.isEmailTaken(Email.of('a@example.com'), b.id)).toBe(true);
            expect(await profiles.isEmailTaken(Email.of('other@example.com'))).toBe(false);
        });
    });

    describe('departments', () => {
        it('returns null for an unknown department', async () => {
            expect(await departments.findById(randomUUID())).toBeNull();
        });

        it('creates a department and reads it back without a head', async () => {
            const dep = department('Разработка');
            await departments.save(dep);
            const found = await departments.findById(dep.id);
            expect(found?.name.value).toBe('Разработка');
            expect(found?.headUserId).toBeUndefined();
        });

        it('renames a department and assigns, then clears the head', async () => {
            const head = newUser('head');
            await users.save(head);
            const dep = department('Разработка');
            await departments.save(dep);

            dep.rename(DepartmentName.of('Платформа'));
            dep.assignHead(head.id);
            await departments.save(dep);
            let found = await departments.findById(dep.id);
            expect(found?.name.value).toBe('Платформа');
            expect(found?.headUserId).toBe(head.id);

            dep.clearHead();
            await departments.save(dep);
            found = await departments.findById(dep.id);
            expect(found?.headUserId).toBeUndefined();
        });

        it('save maps a duplicate name to DepartmentNameTakenError', async () => {
            await departments.save(department('Разработка'));
            await expect(departments.save(department('РАЗРАБОТКА'))).rejects.toBeInstanceOf(
                DepartmentNameTakenError,
            );
        });

        it('isNameTaken is case-insensitive and honours exceptId', async () => {
            const dep = department('Разработка');
            await departments.save(dep);
            expect(await departments.isNameTaken(DepartmentName.of('разработка'))).toBe(true);
            expect(await departments.isNameTaken(DepartmentName.of('Разработка'), dep.id)).toBe(
                false,
            );
            expect(await departments.isNameTaken(DepartmentName.of('Другой'))).toBe(false);
        });

        it('countEmployees counts the profiles of the department', async () => {
            const dep = department('Разработка');
            const other = department('Продажи');
            await departments.save(dep);
            await departments.save(other);
            expect(await departments.countEmployees(dep.id)).toBe(0);
            for (const login of ['a', 'b']) {
                const user = newUser(login);
                await users.save(user);
                await profiles.save(profile(user.id, { departmentId: dep.id }));
            }
            const stray = newUser('c');
            await users.save(stray);
            await profiles.save(profile(stray.id, { departmentId: other.id }));
            expect(await departments.countEmployees(dep.id)).toBe(2);
        });

        it('deletes an empty department', async () => {
            const dep = department('Разработка');
            await departments.save(dep);
            await departments.delete(dep.id);
            expect(await departments.findById(dep.id)).toBeNull();
        });

        it('refuses to delete a department with employees (RESTRICT -> DepartmentNotEmptyError)', async () => {
            const dep = department('Разработка');
            await departments.save(dep);
            const user = newUser('a');
            await users.save(user);
            await profiles.save(profile(user.id, { departmentId: dep.id }));
            await expect(departments.delete(dep.id)).rejects.toBeInstanceOf(
                DepartmentNotEmptyError,
            );
            expect(await departments.findById(dep.id)).not.toBeNull();
        });

        it('the head is cleared when the head user is deleted', async () => {
            const head = newUser('head');
            await users.save(head);
            const dep = department('Разработка', head.id);
            await departments.save(dep);
            await client.query('DELETE FROM auth_users WHERE id = $1', [head.id]);
            expect((await departments.findById(dep.id))?.headUserId).toBeUndefined();
        });
    });
});
