import { Controller, Get } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { ActiveAdminGuard } from '../../application/active-admin-guard';
import { CreateDepartmentUseCase } from '../../application/create-department.use-case';
import { CreateEmployeeUseCase } from '../../application/create-employee.use-case';
import { DeleteDepartmentUseCase } from '../../application/delete-department.use-case';
import { DismissEmployeeUseCase } from '../../application/dismiss-employee.use-case';
import { GetEmployeeUseCase } from '../../application/get-employee.use-case';
import { ListDepartmentsUseCase } from '../../application/list-departments.use-case';
import { ListEmployeesUseCase } from '../../application/list-employees.use-case';
import { ProvisionEmployee } from '../../application/provision-employee';
import { ReplaceEmployeeRolesUseCase } from '../../application/replace-employee-roles.use-case';
import { RestoreEmployeeUseCase } from '../../application/restore-employee.use-case';
import {
    FakeAdminLock,
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeSessions,
    FakeUsers,
    fakeClock,
    fakeHasher,
    fakeTx,
    NOW,
} from '../../application/test-doubles';
import { UpdateDepartmentUseCase } from '../../application/update-department.use-case';
import { UpdateEmployeeProfileUseCase } from '../../application/update-employee-profile.use-case';
import { AuthSession } from '../../domain/auth-session';
import { Login } from '../../domain/login';
import { PasswordHash } from '../../domain/password-hash';
import { AdminLock } from '../../domain/ports/admin-lock.port';
import { AuthSessionRepository } from '../../domain/ports/auth-session-repository.port';
import { Clock } from '../../domain/ports/clock.port';
import { DepartmentRepository } from '../../domain/ports/department-repository.port';
import { EmployeeQuery } from '../../domain/ports/employee-query.port';
import { PasswordGenerator } from '../../domain/ports/password-generator.port';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { UserProfileRepository } from '../../domain/ports/user-profile-repository.port';
import { UserRepository } from '../../domain/ports/user-repository.port';
import { type Role } from '../../domain/role';
import { User } from '../../domain/user';
import { RandomPasswordGenerator } from '../../infrastructure/random-password-generator';
import { AdminDepartmentsController } from './admin-departments.controller';
import { AdminEmployeesController } from './admin-employees.controller';
import { Roles } from './decorators';
import { type AdminHttpFixture, startAdminHttpFixture } from './testing/admin-http-fixture';

@Controller('developer-only')
class DeveloperOnlyController {
    @Get()
    @Roles('developer')
    get(): { ok: true } {
        return { ok: true };
    }
}

/** The administration API over HTTP: real guards, controllers and use cases on in-memory ports. */
describe('administration API (end to end)', () => {
    const users = new FakeUsers();
    const sessions = new FakeSessions();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    let fixture: AdminHttpFixture;

    beforeAll(async () => {
        const query = new FakeEmployeeQuery(users, profiles, departments);
        fixture = await startAdminHttpFixture({
            controllers: [
                AdminEmployeesController,
                AdminDepartmentsController,
                DeveloperOnlyController,
            ],
            providers: [
                { provide: UserRepository, useValue: users },
                { provide: AuthSessionRepository, useValue: sessions },
                { provide: UserProfileRepository, useValue: profiles },
                { provide: DepartmentRepository, useValue: departments },
                { provide: EmployeeQuery, useValue: query },
                { provide: AdminLock, useClass: FakeAdminLock },
                { provide: TransactionRunnerPort, useValue: fakeTx },
                { provide: PasswordHasher, useValue: fakeHasher },
                { provide: PasswordGenerator, useClass: RandomPasswordGenerator },
                { provide: Clock, useValue: fakeClock },
                ActiveAdminGuard,
                ProvisionEmployee,
                ListEmployeesUseCase,
                GetEmployeeUseCase,
                CreateEmployeeUseCase,
                UpdateEmployeeProfileUseCase,
                ReplaceEmployeeRolesUseCase,
                DismissEmployeeUseCase,
                RestoreEmployeeUseCase,
                ListDepartmentsUseCase,
                CreateDepartmentUseCase,
                UpdateDepartmentUseCase,
                DeleteDepartmentUseCase,
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        users.byId.clear();
        users.roles.clear();
        sessions.byId.clear();
        profiles.byUserId.clear();
        departments.byId.clear();
    });

    function addUser(login: string, roles: Role[], active = true): string {
        const id = randomUUID();
        users.byId.set(
            id,
            User.restore({
                id,
                login: Login.of(login),
                passwordHash: PasswordHash.of('hash:old'),
                mustChangePassword: false,
                isActive: active,
                createdAt: NOW,
                passwordChangedAt: NOW,
            }),
        );
        users.roles.set(id, [...roles]);
        return id;
    }

    const api = (
        method: string,
        path: string,
        options: { body?: unknown; as?: string; roles?: Role[] } = {},
    ): Promise<Response> =>
        fetch(`${fixture.base}${path}`, {
            method,
            headers: {
                ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                ...fixture.bearer({ roles: options.roles ?? ['admin'], userId: options.as }),
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });

    async function createEmployee(
        body: Record<string, unknown>,
    ): Promise<{ id: string; temporaryPassword: string }> {
        const res = await api('POST', '/admin/employees', { body });
        expect(res.status).toBe(201);
        const json = (await res.json()) as { employee: { id: string }; temporaryPassword: string };
        return { id: json.employee.id, temporaryPassword: json.temporaryPassword };
    }

    describe('access', () => {
        it('answers 401 without a token and 403 to a developer-only token', async () => {
            expect((await fetch(`${fixture.base}/admin/employees`)).status).toBe(401);
            expect((await api('GET', '/admin/employees', { roles: ['developer'] })).status).toBe(
                403,
            );
            expect((await api('GET', '/admin/departments', { roles: ['developer'] })).status).toBe(
                403,
            );
        });

        it('admin without developer does not get developer rights, and vice versa', async () => {
            expect((await api('GET', '/developer-only', { roles: ['admin'] })).status).toBe(403);
            expect((await api('GET', '/developer-only', { roles: ['developer'] })).status).toBe(
                200,
            );
            expect((await api('GET', '/admin/employees', { roles: ['developer'] })).status).toBe(
                403,
            );
        });
    });

    describe('creation', () => {
        it('creates an active employee with a one-time temporary password', async () => {
            const created = await createEmployee({
                login: 'Ivanov',
                lastName: 'Иванов',
                firstName: 'Иван',
            });
            expect(created.temporaryPassword.length).toBeGreaterThanOrEqual(8);
            const user = users.byId.get(created.id);
            expect(user?.isActive).toBe(true);
            expect(user?.mustChangePassword).toBe(true);
            expect(user?.login.value).toBe('ivanov');
            // stored only as a hash
            expect(user?.passwordHash.value).toBe(`hash:${created.temporaryPassword}`);
        });

        it('does not return the password on the next GET of the card', async () => {
            const created = await createEmployee({
                login: 'ivanov',
                lastName: 'И',
                firstName: 'И',
            });
            const res = await api('GET', `/admin/employees/${created.id}`);
            const text = await res.text();
            expect(res.status).toBe(200);
            expect(text).not.toContain(created.temporaryPassword);
            expect(text).not.toMatch(/password/i);
            const list = await (await api('GET', '/admin/employees')).text();
            expect(list).not.toContain(created.temporaryPassword);
        });

        it('creates an employee with a department and roles', async () => {
            const department = (await (
                await api('POST', '/admin/departments', { body: { name: 'Колл-центр 1' } })
            ).json()) as { id: string };
            const created = await createEmployee({
                login: 'ivanov',
                lastName: 'Иванов',
                firstName: 'Иван',
                departmentId: department.id,
                roles: ['developer'],
            });
            const card = (await (await api('GET', `/admin/employees/${created.id}`)).json()) as {
                department: { id: string; name: string };
                roles: string[];
            };
            expect(card.department).toEqual({ id: department.id, name: 'Колл-центр 1' });
            expect(card.roles).toEqual(['developer']);
        });

        it('answers 409 for a repeated login and a repeated email, creating nothing', async () => {
            await createEmployee({
                login: 'ivanov',
                lastName: 'И',
                firstName: 'И',
                email: 'a@example.com',
            });
            const sameLogin = await api('POST', '/admin/employees', {
                body: { login: 'IVANOV', lastName: 'П', firstName: 'П' },
            });
            expect(sameLogin.status).toBe(409);
            expect(await sameLogin.json()).toMatchObject({ code: 'LOGIN_TAKEN' });
            const sameEmail = await api('POST', '/admin/employees', {
                body: { login: 'petrov', lastName: 'П', firstName: 'П', email: 'A@example.com' },
            });
            expect(sameEmail.status).toBe(409);
            expect(await sameEmail.json()).toMatchObject({ code: 'EMAIL_TAKEN' });
            expect(users.byId.size).toBe(1);
        });

        it('answers 404 for an unknown department, creating nothing', async () => {
            const res = await api('POST', '/admin/employees', {
                body: { login: 'a', lastName: 'А', firstName: 'А', departmentId: randomUUID() },
            });
            expect(res.status).toBe(404);
            expect(users.byId.size).toBe(0);
        });

        it('answers 400 for blank names and unknown roles, creating nothing', async () => {
            const noName = await api('POST', '/admin/employees', {
                body: { login: 'a', lastName: '  ', firstName: 'А' },
            });
            const badRole = await api('POST', '/admin/employees', {
                body: { login: 'a', lastName: 'А', firstName: 'А', roles: ['root'] },
            });
            expect(noName.status).toBe(400);
            expect(badRole.status).toBe(400);
            expect(users.byId.size).toBe(0);
        });
    });

    describe('list and card', () => {
        it('searches, filters and pages with zero-based pages', async () => {
            const a = addUser('anna', []);
            addUser('boris', []);
            addUser('clara', [], false);
            profiles.byUserId.clear();
            const first = (await (await api('GET', '/admin/employees?limit=2&page=0')).json()) as {
                items: { id: string }[];
                total: number;
                page: number;
                limit: number;
            };
            expect(first).toMatchObject({ total: 3, page: 0, limit: 2 });
            expect(first.items).toHaveLength(2);
            const second = (await (await api('GET', '/admin/employees?limit=2&page=1')).json()) as {
                items: unknown[];
                page: number;
            };
            expect(second.items).toHaveLength(1);
            expect(second.page).toBe(1);

            const dismissed = (await (
                await api('GET', '/admin/employees?isActive=false')
            ).json()) as {
                items: { login: string }[];
            };
            expect(dismissed.items.map((i) => i.login)).toEqual(['clara']);
            const found = (await (await api('GET', '/admin/employees?search=ANN')).json()) as {
                items: { id: string }[];
            };
            expect(found.items.map((i) => i.id)).toEqual([a]);
        });

        it('answers 404 for an unknown card and 400 for bad parameters', async () => {
            expect((await api('GET', `/admin/employees/${randomUUID()}`)).status).toBe(404);
            expect((await api('GET', '/admin/employees?limit=101')).status).toBe(400);
            expect((await api('GET', `/admin/employees?search=${'a'.repeat(101)}`)).status).toBe(
                400,
            );
        });
    });

    describe('profile edit', () => {
        it('keeps what was not sent, clears what was sent empty, and never changes the login', async () => {
            const created = await createEmployee({
                login: 'ivanov',
                lastName: 'Иванов',
                firstName: 'Иван',
                position: 'Оператор',
                email: 'i@example.com',
            });
            const res = await api('PATCH', `/admin/employees/${created.id}`, {
                body: { login: 'hacker', email: '', position: 'Старший оператор' },
            });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({
                login: 'ivanov',
                lastName: 'Иванов',
                firstName: 'Иван',
                email: null,
                position: 'Старший оператор',
            });
            expect(users.byId.get(created.id)?.login.value).toBe('ivanov');
        });

        it('edits a dismissed employee and answers 409 for an email of another one', async () => {
            const a = await createEmployee({
                login: 'a',
                lastName: 'А',
                firstName: 'А',
                email: 'a@example.com',
            });
            const b = await createEmployee({ login: 'b', lastName: 'Б', firstName: 'Б' });
            addUser('root', ['admin']);
            await api('POST', `/admin/employees/${b.id}/dismiss`);
            const taken = await api('PATCH', `/admin/employees/${b.id}`, {
                body: { email: 'A@example.com' },
            });
            expect(taken.status).toBe(409);
            expect(await taken.json()).toMatchObject({ code: 'EMAIL_TAKEN' });
            expect(profiles.byUserId.get(b.id)?.email).toBeUndefined();
            const ok = await api('PATCH', `/admin/employees/${b.id}`, { body: { position: 'X' } });
            expect(ok.status).toBe(200);
            expect(a).toBeDefined();
        });
    });

    describe('roles', () => {
        it('grants and removes roles; an empty set is allowed', async () => {
            addUser('root', ['admin']);
            const { id } = await createEmployee({ login: 'a', lastName: 'А', firstName: 'А' });
            const granted = await api('PUT', `/admin/employees/${id}/roles`, {
                body: { roles: ['developer'] },
            });
            expect(await granted.json()).toMatchObject({ roles: ['developer'] });
            const cleared = await api('PUT', `/admin/employees/${id}/roles`, {
                body: { roles: [] },
            });
            expect(await cleared.json()).toMatchObject({ roles: [] });
        });

        it('answers 400 for an unknown role and leaves the roles unchanged', async () => {
            addUser('root', ['admin']);
            const { id } = await createEmployee({
                login: 'a',
                lastName: 'А',
                firstName: 'А',
                roles: ['developer'],
            });
            const res = await api('PUT', `/admin/employees/${id}/roles`, {
                body: { roles: ['root'] },
            });
            expect(res.status).toBe(400);
            expect(users.roles.get(id)).toEqual(['developer']);
        });

        it('a role revoked from the database stays valid in an issued token until it expires', async () => {
            const adminId = addUser('root', ['admin']);
            const second = addUser('second', ['admin']);
            // The token was issued while the user still was an admin.
            const stale = fixture.bearer({ roles: ['admin'], userId: second });
            const revoke = await api('PUT', `/admin/employees/${second}/roles`, {
                body: { roles: [] },
                as: adminId,
            });
            expect(revoke.status).toBe(200);
            expect(users.roles.get(second)).toEqual([]);
            const withOldToken = await fetch(`${fixture.base}/admin/employees`, { headers: stale });
            expect(withOldToken.status).toBe(200);
            // A token issued after the change carries no admin role.
            const fresh = await api('GET', '/admin/employees', { roles: [], as: second });
            expect(fresh.status).toBe(403);
        });

        it('answers 409 LAST_ADMIN when the only admin drops the role', async () => {
            const adminId = addUser('root', ['admin']);
            const res = await api('PUT', `/admin/employees/${adminId}/roles`, {
                body: { roles: ['developer'] },
                as: adminId,
            });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'LAST_ADMIN' });
            // The rollback itself needs a database; the in-memory runner does not undo writes.
        });

        it('lets one of two admins drop the role, then protects the remaining one', async () => {
            const first = addUser('first', ['admin']);
            const second = addUser('second', ['admin']);
            const drop = await api('PUT', `/admin/employees/${first}/roles`, {
                body: { roles: [] },
                as: first,
            });
            expect(drop.status).toBe(200);
            const last = await api('PUT', `/admin/employees/${second}/roles`, {
                body: { roles: [] },
                as: second,
            });
            expect(last.status).toBe(409);
        });

        it('counts a dismissed admin out: the remaining one cannot drop the role', async () => {
            const first = addUser('first', ['admin']);
            const second = addUser('second', ['admin']);
            expect((await api('POST', `/admin/employees/${second}/dismiss`)).status).toBe(200);
            const res = await api('PUT', `/admin/employees/${first}/roles`, {
                body: { roles: [] },
                as: first,
            });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'LAST_ADMIN' });
        });
    });

    describe('dismiss and restore', () => {
        function addSession(userId: string): AuthSession {
            const session = AuthSession.start({
                id: randomUUID(),
                userId,
                now: NOW,
                firstToken: {
                    id: randomUUID(),
                    tokenHash: randomUUID(),
                    expiresAt: new Date(NOW.getTime() + 1e9),
                },
            });
            sessions.byId.set(session.id, session);
            return session;
        }

        it('dismisses, revokes all refresh sessions and is idempotent', async () => {
            addUser('root', ['admin']);
            const { id } = await createEmployee({ login: 'a', lastName: 'А', firstName: 'А' });
            const s1 = addSession(id);
            const s2 = addSession(id);
            const first = await api('POST', `/admin/employees/${id}/dismiss`);
            expect(first.status).toBe(200);
            expect(await first.json()).toMatchObject({ isActive: false });
            expect(s1.isRevoked()).toBe(true);
            expect(s2.isRevoked()).toBe(true);
            const again = await api('POST', `/admin/employees/${id}/dismiss`);
            expect(again.status).toBe(200);
            expect(await again.json()).toMatchObject({ isActive: false });
        });

        it('restores with the same password and profile and is idempotent', async () => {
            addUser('root', ['admin']);
            const { id } = await createEmployee({
                login: 'a',
                lastName: 'Иванов',
                firstName: 'Иван',
                position: 'Оператор',
            });
            const hash = users.byId.get(id)?.passwordHash.value;
            await api('POST', `/admin/employees/${id}/dismiss`);
            const restored = await api('POST', `/admin/employees/${id}/restore`);
            expect(restored.status).toBe(200);
            expect(await restored.json()).toMatchObject({
                isActive: true,
                lastName: 'Иванов',
                position: 'Оператор',
            });
            expect(users.byId.get(id)?.passwordHash.value).toBe(hash);
            expect((await api('POST', `/admin/employees/${id}/restore`)).status).toBe(200);
        });

        it('answers 409 LAST_ADMIN when dismissing the only active admin', async () => {
            const adminId = addUser('root', ['admin']);
            const res = await api('POST', `/admin/employees/${adminId}/dismiss`, { as: adminId });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'LAST_ADMIN' });
        });

        it('answers 404 for an unknown employee', async () => {
            expect((await api('POST', `/admin/employees/${randomUUID()}/dismiss`)).status).toBe(
                404,
            );
            expect((await api('POST', `/admin/employees/${randomUUID()}/restore`)).status).toBe(
                404,
            );
        });
    });

    describe('departments', () => {
        it('creates, lists with counts and head, renames, clears the head and deletes an empty one', async () => {
            const head = await createEmployee({
                login: 'boss',
                lastName: 'Петров',
                firstName: 'Пётр',
            });
            const created = await api('POST', '/admin/departments', {
                body: { name: 'Колл-центр 1', headUserId: head.id },
            });
            expect(created.status).toBe(201);
            const department = (await created.json()) as { id: string };

            const list = (await (await api('GET', '/admin/departments')).json()) as unknown[];
            expect(list).toEqual([
                {
                    id: department.id,
                    name: 'Колл-центр 1',
                    head: { id: head.id, fullName: 'Петров Пётр', isActive: true },
                    employeeCount: 0,
                },
            ]);

            const renamed = await api('PATCH', `/admin/departments/${department.id}`, {
                body: { name: 'Колл-центр 2' },
            });
            expect(await renamed.json()).toMatchObject({
                name: 'Колл-центр 2',
                head: { id: head.id },
            });
            const cleared = await api('PATCH', `/admin/departments/${department.id}`, {
                body: { headUserId: null },
            });
            expect(await cleared.json()).toMatchObject({ head: null });

            expect((await api('DELETE', `/admin/departments/${department.id}`)).status).toBe(204);
            expect(await (await api('GET', '/admin/departments')).json()).toEqual([]);
        });

        it('answers 409 for a repeated name and 404 for a missing head', async () => {
            await api('POST', '/admin/departments', { body: { name: 'Отдел' } });
            const dup = await api('POST', '/admin/departments', { body: { name: 'отдел' } });
            expect(dup.status).toBe(409);
            expect(await dup.json()).toMatchObject({ code: 'DEPARTMENT_NAME_TAKEN' });
            const missing = await api('POST', '/admin/departments', {
                body: { name: 'Другой', headUserId: randomUUID() },
            });
            expect(missing.status).toBe(404);
        });

        it('answers 409 DEPARTMENT_NOT_EMPTY, also for a dismissed member', async () => {
            addUser('root', ['admin']);
            const department = (await (
                await api('POST', '/admin/departments', { body: { name: 'Отдел' } })
            ).json()) as { id: string };
            const member = await createEmployee({
                login: 'a',
                lastName: 'А',
                firstName: 'А',
                departmentId: department.id,
            });
            await api('POST', `/admin/employees/${member.id}/dismiss`);
            const res = await api('DELETE', `/admin/departments/${department.id}`);
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'DEPARTMENT_NOT_EMPTY' });
            expect(departments.byId.has(department.id)).toBe(true);
        });

        it('answers 404 for an unknown department', async () => {
            expect((await api('DELETE', `/admin/departments/${randomUUID()}`)).status).toBe(404);
            expect(
                (await api('PATCH', `/admin/departments/${randomUUID()}`, { body: { name: 'X' } }))
                    .status,
            ).toBe(404);
        });
    });
});
