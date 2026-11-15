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
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import type { Role } from '../domain/role';
import { User } from '../domain/user';
import { PgAdminLock } from './pg-admin-lock';
import { SlonikDepartmentRepository } from './slonik-department.repository';
import { SlonikEmployeeQuery } from './slonik-employee.query';
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

const sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(adminUrl === undefined)('SlonikEmployeeQuery and PgAdminLock', () => {
    const dbName = `auth_empq_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let tx: TransactionRunner;
    let users: SlonikUserRepository;
    let profiles: SlonikUserProfileRepository;
    let departments: SlonikDepartmentRepository;
    let query: SlonikEmployeeQuery;
    let lock: PgAdminLock;

    interface Seed {
        login: string;
        name?: { lastName: string; firstName: string; middleName?: string };
        departmentId?: string;
        email?: string;
        position?: string;
        active?: boolean;
        roles?: Role[];
    }

    async function seed(input: Seed): Promise<User> {
        const user = newUser(input.login);
        await users.save(user);
        if (input.active === false) await users.setActive(user.id, false);
        if (input.roles !== undefined) await users.assignRoles(user.id, input.roles);
        if (input.name !== undefined) {
            await profiles.save(
                EmployeeProfile.create({
                    userId: user.id,
                    name: PersonName.of(input.name),
                    departmentId: input.departmentId,
                    position: input.position,
                    email: input.email === undefined ? undefined : Email.of(input.email),
                }),
            );
        }
        return user;
    }

    async function addDepartment(name: string, headUserId?: string): Promise<Department> {
        const dep = Department.create({
            id: randomUUID(),
            name: DepartmentName.of(name),
            headUserId,
        });
        await departments.save(dep);
        return dep;
    }

    const page = (
        extra: Partial<Parameters<SlonikEmployeeQuery['list']>[0]> = {},
    ): ReturnType<SlonikEmployeeQuery['list']> => query.list({ limit: 50, page: 1, ...extra });

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
        query = new SlonikEmployeeQuery(tx);
        lock = new PgAdminLock(tx);
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

    describe('list', () => {
        it('returns an employee with profile, department and roles joined', async () => {
            const dep = await addDepartment('Разработка');
            const user = await seed({
                login: 'ivanov',
                name: { lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' },
                departmentId: dep.id,
                email: 'Ivanov@Example.com',
                position: 'Разработчик',
                roles: ['developer', 'admin'],
            });
            await client.query(
                `UPDATE auth_user_profiles SET scrm_employee_id = 'scrm-1' WHERE user_id = $1`,
                [user.id],
            );
            const { items, total } = await page();
            expect(total).toBe(1);
            expect(items).toEqual([
                {
                    id: user.id,
                    login: 'ivanov',
                    isActive: true,
                    mustChangePassword: true,
                    fullName: 'Иванов Иван Иванович',
                    lastName: 'Иванов',
                    firstName: 'Иван',
                    middleName: 'Иванович',
                    position: 'Разработчик',
                    email: 'ivanov@example.com',
                    scrmEmployeeId: 'scrm-1',
                    department: { id: dep.id, name: 'Разработка' },
                    roles: ['admin', 'developer'],
                },
            ]);
        });

        it('returns a user without a profile row: login as full name, nulls, no roles', async () => {
            const user = await seed({ login: 'bare' });
            const { items } = await page();
            expect(items).toHaveLength(1);
            expect(items[0]).toMatchObject({
                id: user.id,
                login: 'bare',
                fullName: 'bare',
                lastName: null,
                firstName: null,
                middleName: null,
                position: null,
                email: null,
                scrmEmployeeId: null,
                department: null,
                roles: [],
            });
        });

        it('includes active and dismissed employees without an isActive filter', async () => {
            await seed({ login: 'a' });
            await seed({ login: 'b', active: false });
            const { items, total } = await page();
            expect(total).toBe(2);
            expect(items.map((item) => item.isActive).sort()).toEqual([false, true]);
        });

        it('sorts by last name, first name, then login, case-insensitively', async () => {
            await seed({ login: 'z1', name: { lastName: 'петров', firstName: 'Пётр' } });
            await seed({ login: 'z2', name: { lastName: 'Иванов', firstName: 'Пётр' } });
            await seed({ login: 'z3', name: { lastName: 'Иванов', firstName: 'Антон' } });
            await seed({ login: 'b', name: { lastName: 'Сидоров', firstName: 'Олег' } });
            await seed({ login: 'a', name: { lastName: 'Сидоров', firstName: 'Олег' } });
            const { items } = await page();
            expect(items.map((item) => item.login)).toEqual(['z3', 'z2', 'z1', 'a', 'b']);
        });

        it.each([
            ['last name', 'ИВАН'],
            ['first name', 'ПЁТР'],
            ['middle name', 'сергеевич'],
            ['login', 'MY_LOGIN'],
            ['email', 'Match@Example'],
        ])('searches by %s without regard to case', async (_label, text) => {
            const hit = await seed({
                login: text === 'MY_LOGIN' ? 'my_login' : 'hit',
                name: {
                    lastName: text === 'ИВАН' ? 'Иванов' : 'Другой',
                    firstName: text === 'ПЁТР' ? 'Пётр' : 'Имя',
                    middleName: text === 'сергеевич' ? 'Сергеевич' : 'Отч',
                },
                email: text === 'Match@Example' ? 'match@example.com' : 'hit@x.org',
            });
            await seed({ login: 'miss', name: { lastName: 'Ёлкин', firstName: 'Яков' } });
            const { items, total } = await page({ search: text });
            expect(total).toBe(1);
            expect(items[0]?.id).toBe(hit.id);
        });

        it('escapes % and _ so they match literally', async () => {
            const percent = await seed({ login: 'p', name: { lastName: '100%', firstName: 'A' } });
            const underscore = await seed({
                login: 'u_x',
                name: { lastName: 'B', firstName: 'B' },
            });
            await seed({ login: 'plain', name: { lastName: 'Иванов', firstName: 'Иван' } });
            expect((await page({ search: '%' })).items.map((i) => i.id)).toEqual([percent.id]);
            expect((await page({ search: '_' })).items.map((i) => i.id)).toEqual([underscore.id]);
        });

        it('filters by department', async () => {
            const dep = await addDepartment('Разработка');
            const other = await addDepartment('Продажи');
            const hit = await seed({
                login: 'a',
                name: { lastName: 'А', firstName: 'А' },
                departmentId: dep.id,
            });
            await seed({
                login: 'b',
                name: { lastName: 'Б', firstName: 'Б' },
                departmentId: other.id,
            });
            await seed({ login: 'c' });
            const { items, total } = await page({ departmentId: dep.id });
            expect(total).toBe(1);
            expect(items[0]?.id).toBe(hit.id);
        });

        it('filters by dismissal flag', async () => {
            const active = await seed({ login: 'a' });
            const dismissed = await seed({ login: 'b', active: false });
            expect((await page({ isActive: true })).items.map((i) => i.id)).toEqual([active.id]);
            expect((await page({ isActive: false })).items.map((i) => i.id)).toEqual([
                dismissed.id,
            ]);
        });

        it('paginates and reports the overall total', async () => {
            for (const login of ['a', 'b', 'c', 'd', 'e']) {
                await seed({ login, name: { lastName: login, firstName: login } });
            }
            const first = await page({ limit: 2, page: 1 });
            const last = await page({ limit: 2, page: 3 });
            const beyond = await page({ limit: 2, page: 4 });
            expect(first.total).toBe(5);
            expect(first.items.map((i) => i.login)).toEqual(['a', 'b']);
            expect(last.items.map((i) => i.login)).toEqual(['e']);
            expect(beyond.items).toEqual([]);
            expect(beyond.total).toBe(5);
        });

        it('total honours filters, not just the page', async () => {
            await seed({ login: 'ivan1', name: { lastName: 'Иванов', firstName: 'А' } });
            await seed({ login: 'ivan2', name: { lastName: 'Иванова', firstName: 'Б' } });
            await seed({ login: 'other' });
            const result = await page({ search: 'иванов', limit: 1 });
            expect(result.total).toBe(2);
            expect(result.items).toHaveLength(1);
        });
    });

    describe('findById', () => {
        it('returns the card of an employee', async () => {
            const dep = await addDepartment('Разработка');
            const user = await seed({
                login: 'ivanov',
                name: { lastName: 'Иванов', firstName: 'Иван' },
                departmentId: dep.id,
                roles: ['admin'],
                active: false,
            });
            const card = await query.findById(user.id);
            expect(card).toMatchObject({
                id: user.id,
                login: 'ivanov',
                isActive: false,
                fullName: 'Иванов Иван',
                department: { id: dep.id, name: 'Разработка' },
                roles: ['admin'],
            });
        });

        it('returns null for an unknown id', async () => {
            expect(await query.findById(randomUUID())).toBeNull();
        });
    });

    describe('departments', () => {
        it('lists departments by name with head full name and employee count', async () => {
            const head = await seed({
                login: 'head',
                name: { lastName: 'Руков', firstName: 'Олег' },
            });
            const sales = await addDepartment('Продажи', head.id);
            const dev = await addDepartment('Разработка');
            await seed({
                login: 'a',
                name: { lastName: 'А', firstName: 'А' },
                departmentId: dev.id,
            });
            await seed({
                login: 'b',
                name: { lastName: 'Б', firstName: 'Б' },
                departmentId: dev.id,
            });
            const list = await query.listDepartments();
            expect(list).toEqual([
                {
                    id: sales.id,
                    name: 'Продажи',
                    head: { id: head.id, login: 'head', fullName: 'Руков Олег' },
                    employeeCount: 0,
                },
                { id: dev.id, name: 'Разработка', head: null, employeeCount: 2 },
            ]);
        });

        it('findDepartmentById returns one department or null', async () => {
            const dev = await addDepartment('Разработка');
            expect(await query.findDepartmentById(dev.id)).toEqual({
                id: dev.id,
                name: 'Разработка',
                head: null,
                employeeCount: 0,
            });
            expect(await query.findDepartmentById(randomUUID())).toBeNull();
        });
    });

    describe('PgAdminLock', () => {
        it('serializes two concurrent transactions on the shared lock', async () => {
            const events: string[] = [];
            const first = tx.run(async () => {
                await lock.acquire();
                events.push('first:acquired');
                await sleep(300);
                events.push('first:done');
            });
            await sleep(50);
            const second = tx.run(async () => {
                events.push('second:waiting');
                await lock.acquire();
                events.push('second:acquired');
            });
            await Promise.all([first, second]);
            expect(events).toEqual([
                'first:acquired',
                'second:waiting',
                'first:done',
                'second:acquired',
            ]);
        });

        it('releases the lock when the transaction ends, including by rollback', async () => {
            await expect(
                tx.run(async () => {
                    await lock.acquire();
                    throw new Error('boom');
                }),
            ).rejects.toThrow('boom');
            const startedAt = Date.now();
            await tx.run(() => lock.acquire());
            expect(Date.now() - startedAt).toBeLessThan(1000);
        });
    });
});
