import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateEmployeeUseCase } from '../../application/create-employee.use-case';
import { DismissEmployeeUseCase } from '../../application/dismiss-employee.use-case';
import { GetEmployeeUseCase } from '../../application/get-employee.use-case';
import { ListEmployeesUseCase } from '../../application/list-employees.use-case';
import { ReplaceEmployeeRolesUseCase } from '../../application/replace-employee-roles.use-case';
import { RestoreEmployeeUseCase } from '../../application/restore-employee.use-case';
import { UpdateEmployeeProfileUseCase } from '../../application/update-employee-profile.use-case';
import type { EmployeeView } from '../../domain/employee-view';
import {
    DepartmentNotFoundError,
    EmailTakenError,
    EmployeeNotFoundError,
    LastAdminError,
    LoginTakenError,
} from '../../domain/errors';
import { AdminEmployeesController } from './admin-employees.controller';
import { type AdminHttpFixture, startAdminHttpFixture } from './testing/admin-http-fixture';

const useCases = {
    list: { execute: vi.fn() },
    get: { execute: vi.fn() },
    create: { execute: vi.fn() },
    update: { execute: vi.fn() },
    roles: { execute: vi.fn() },
    dismiss: { execute: vi.fn() },
    restore: { execute: vi.fn() },
};

const ID = randomUUID();
const DEPARTMENT_ID = randomUUID();

function employee(overrides: Partial<EmployeeView> = {}): EmployeeView {
    return {
        id: ID,
        login: 'ivanov',
        isActive: true,
        mustChangePassword: true,
        fullName: 'Иванов Иван',
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: null,
        position: null,
        email: null,
        scrmEmployeeId: null,
        department: null,
        roles: [],
        ...overrides,
    };
}

describe('AdminEmployeesController', () => {
    let fixture: AdminHttpFixture;

    beforeAll(async () => {
        fixture = await startAdminHttpFixture({
            controllers: [AdminEmployeesController],
            providers: [
                { provide: ListEmployeesUseCase, useValue: useCases.list },
                { provide: GetEmployeeUseCase, useValue: useCases.get },
                { provide: CreateEmployeeUseCase, useValue: useCases.create },
                { provide: UpdateEmployeeProfileUseCase, useValue: useCases.update },
                { provide: ReplaceEmployeeRolesUseCase, useValue: useCases.roles },
                { provide: DismissEmployeeUseCase, useValue: useCases.dismiss },
                { provide: RestoreEmployeeUseCase, useValue: useCases.restore },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        useCases.list.execute.mockResolvedValue({
            items: [employee()],
            total: 1,
            limit: 20,
            page: 1,
        });
        useCases.get.execute.mockResolvedValue(employee());
        useCases.update.execute.mockResolvedValue(employee());
        useCases.roles.execute.mockResolvedValue(employee({ roles: ['developer'] }));
        useCases.dismiss.execute.mockResolvedValue(employee({ isActive: false }));
        useCases.restore.execute.mockResolvedValue(employee());
        useCases.create.execute.mockResolvedValue({
            employee: employee(),
            temporaryPassword: 'Temp-Pass-1',
        });
    });

    const call = (
        method: string,
        path: string,
        options: { body?: unknown; headers?: Record<string, string> } = {},
    ): Promise<Response> =>
        fetch(`${fixture.base}/admin/employees${path}`, {
            method,
            headers: {
                ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                ...(options.headers ?? fixture.bearer()),
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });

    describe('access', () => {
        const routes: [string, string, unknown?][] = [
            ['GET', ''],
            ['GET', `/${ID}`],
            ['POST', '', { login: 'a', lastName: 'A', firstName: 'A' }],
            ['PATCH', `/${ID}`, {}],
            ['PUT', `/${ID}/roles`, { roles: [] }],
            ['POST', `/${ID}/dismiss`],
            ['POST', `/${ID}/restore`],
        ];

        it.each(routes)('%s %s answers 401 without a token', async (method, path, body) => {
            const res = await call(method, path, { body, headers: {} });
            expect(res.status).toBe(401);
        });

        it.each(routes)(
            '%s %s answers 403 to a developer without admin',
            async (method, path, body) => {
                const res = await call(method, path, {
                    body,
                    headers: fixture.bearer({ roles: ['developer'] }),
                });
                expect(res.status).toBe(403);
            },
        );

        it('answers 403 to a user without roles', async () => {
            const res = await call('GET', '', { headers: fixture.bearer({ roles: [] }) });
            expect(res.status).toBe(403);
        });

        it('answers 403 PASSWORD_CHANGE_REQUIRED while the password change is pending', async () => {
            const res = await call('GET', '', {
                headers: fixture.bearer({ roles: ['admin'], mustChangePassword: true }),
            });
            expect(res.status).toBe(403);
            expect(await res.json()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
        });

        it('lets a user with admin and developer in', async () => {
            const res = await call('GET', '', {
                headers: fixture.bearer({ roles: ['developer', 'admin'] }),
            });
            expect(res.status).toBe(200);
        });

        it('never reaches a use case when access is denied', async () => {
            await call('POST', `/${ID}/dismiss`, {
                headers: fixture.bearer({ roles: ['developer'] }),
            });
            await call('GET', '', { headers: {} });
            expect(Object.values(useCases).every((u) => u.execute.mock.calls.length === 0)).toBe(
                true,
            );
        });
    });

    describe('GET /admin/employees', () => {
        it('returns the page with the employee fields and no security fields', async () => {
            useCases.list.execute.mockResolvedValue({
                items: [
                    {
                        ...employee({
                            department: { id: DEPARTMENT_ID, name: 'Колл-центр 1' },
                            position: 'Оператор',
                            email: 'i@example.com',
                            scrmEmployeeId: 'scrm-1',
                            roles: ['developer'],
                        }),
                        passwordHash: 'leak',
                    },
                ],
                total: 41,
                limit: 20,
                page: 2,
            });
            const res = await call('GET', '?page=1');
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                items: [
                    {
                        id: ID,
                        login: 'ivanov',
                        lastName: 'Иванов',
                        firstName: 'Иван',
                        middleName: null,
                        fullName: 'Иванов Иван',
                        department: { id: DEPARTMENT_ID, name: 'Колл-центр 1' },
                        position: 'Оператор',
                        email: 'i@example.com',
                        scrmEmployeeId: 'scrm-1',
                        roles: ['developer'],
                        isActive: true,
                    },
                ],
                total: 41,
                limit: 20,
                page: 1,
            });
        });

        it('uses the default paging and no filters without parameters', async () => {
            await call('GET', '');
            // the directory query counts pages from one, the API from zero
            expect(useCases.list.execute).toHaveBeenCalledWith({ limit: 20, page: 1 });
        });

        it('passes search, department, status and paging to the use case', async () => {
            await call(
                'GET',
                `?search=%20иван%20&departmentId=${DEPARTMENT_ID}&isActive=false&limit=5&page=2`,
            );
            expect(useCases.list.execute).toHaveBeenCalledWith({
                search: 'иван',
                departmentId: DEPARTMENT_ID,
                isActive: false,
                limit: 5,
                page: 3,
            });
        });

        it('passes isActive=true', async () => {
            await call('GET', '?isActive=true');
            expect(useCases.list.execute.mock.calls[0]?.[0]).toMatchObject({ isActive: true });
        });

        it.each([
            ['limit above the maximum', '?limit=101'],
            ['zero limit', '?limit=0'],
            ['negative page', '?page=-1'],
            ['too long search', `?search=${'a'.repeat(101)}`],
            ['foreign isActive value', '?isActive=maybe'],
            ['too long department id', `?departmentId=${'a'.repeat(65)}`],
        ])('answers 400 for %s', async (_name, query) => {
            const res = await call('GET', query);
            expect(res.status).toBe(400);
            expect(useCases.list.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /admin/employees/:id', () => {
        it('returns the card', async () => {
            const res = await call('GET', `/${ID}`);
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ id: ID, login: 'ivanov', isActive: true });
            expect(useCases.get.execute).toHaveBeenCalledWith(ID);
        });

        it('has no password or hash in the card', async () => {
            useCases.get.execute.mockResolvedValue({ ...employee(), passwordHash: 'leak' });
            const body = JSON.stringify(await (await call('GET', `/${ID}`)).json());
            expect(body).not.toMatch(/password/i);
            expect(body).not.toContain('leak');
        });

        it('answers 404 for an unknown employee', async () => {
            useCases.get.execute.mockRejectedValue(new EmployeeNotFoundError());
            const res = await call('GET', `/${randomUUID()}`);
            expect(res.status).toBe(404);
            expect(await res.json()).toMatchObject({ code: 'EMPLOYEE_NOT_FOUND' });
        });

        it('answers 400 for a malformed id', async () => {
            expect((await call('GET', '/not-a-uuid')).status).toBe(400);
            expect(useCases.get.execute).not.toHaveBeenCalled();
        });
    });

    describe('seeded department with a text id', () => {
        it('is accepted as a filter', async () => {
            const res = await call('GET', '?departmentId=dev');
            expect(res.status).toBe(200);
            expect(useCases.list.execute).toHaveBeenCalledWith(
                expect.objectContaining({ departmentId: 'dev' }),
            );
        });

        it('is accepted when creating an employee', async () => {
            const res = await call('POST', '', {
                body: { login: 'a', lastName: 'А', firstName: 'А', departmentId: 'dev' },
            });
            expect(res.status).toBe(201);
        });
    });

    describe('POST /admin/employees', () => {
        const body = { login: 'ivanov', lastName: 'Иванов', firstName: 'Иван' };

        it('answers 201 with the employee and the temporary password', async () => {
            const res = await call('POST', '', { body });
            expect(res.status).toBe(201);
            expect(await res.json()).toMatchObject({
                employee: { id: ID, login: 'ivanov' },
                temporaryPassword: 'Temp-Pass-1',
            });
        });

        it('passes every field to the use case', async () => {
            const full = {
                ...body,
                middleName: 'Иванович',
                departmentId: DEPARTMENT_ID,
                position: 'Оператор',
                email: 'i@example.com',
                scrmEmployeeId: 'scrm-1',
                roles: ['developer', 'admin'],
            };
            await call('POST', '', { body: full });
            expect(useCases.create.execute).toHaveBeenCalledWith(full);
        });

        it('does not put the password into the employee object', async () => {
            const json = (await (await call('POST', '', { body })).json()) as {
                employee: Record<string, unknown>;
            };
            expect(Object.keys(json.employee)).not.toContain('temporaryPassword');
            expect(Object.keys(json.employee)).not.toContain('mustChangePassword');
        });

        it.each([
            ['no last name', { login: 'a', firstName: 'Иван' }],
            ['no first name', { login: 'a', lastName: 'Иванов' }],
            ['no login', { lastName: 'Иванов', firstName: 'Иван' }],
            ['blank last name', { ...body, lastName: '   ' }],
            ['blank first name', { ...body, firstName: '' }],
            ['blank login', { ...body, login: ' ' }],
            ['too long last name', { ...body, lastName: 'я'.repeat(201) }],
            ['too long login', { ...body, login: 'a'.repeat(65) }],
            ['too long position', { ...body, position: 'я'.repeat(201) }],
            ['too long scrm id', { ...body, scrmEmployeeId: 'x'.repeat(65) }],
            ['bad email', { ...body, email: 'not-an-email' }],
            ['too long email', { ...body, email: `${'a'.repeat(250)}@example.com` }],
            ['unknown role', { ...body, roles: ['superuser'] }],
            ['roles not an array', { ...body, roles: 'admin' }],
            ['too long department id', { ...body, departmentId: 'a'.repeat(65) }],
        ])('answers 400 for %s', async (_name, payload) => {
            const res = await call('POST', '', { body: payload });
            expect(res.status).toBe(400);
            expect(useCases.create.execute).not.toHaveBeenCalled();
        });

        it('answers 409 LOGIN_TAKEN', async () => {
            useCases.create.execute.mockRejectedValue(new LoginTakenError());
            const res = await call('POST', '', { body });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'LOGIN_TAKEN' });
        });

        it('answers 409 EMAIL_TAKEN', async () => {
            useCases.create.execute.mockRejectedValue(new EmailTakenError());
            const res = await call('POST', '', { body });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'EMAIL_TAKEN' });
        });

        it('answers 404 DEPARTMENT_NOT_FOUND', async () => {
            useCases.create.execute.mockRejectedValue(new DepartmentNotFoundError());
            const res = await call('POST', '', { body: { ...body, departmentId: DEPARTMENT_ID } });
            expect(res.status).toBe(404);
            expect(await res.json()).toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
        });
    });

    describe('PATCH /admin/employees/:id', () => {
        it('passes only the fields that were sent', async () => {
            await call('PATCH', `/${ID}`, { body: { position: 'Старший оператор' } });
            expect(useCases.update.execute).toHaveBeenCalledWith(ID, {
                position: 'Старший оператор',
            });
        });

        it('passes null and empty strings through so they clear optional fields', async () => {
            await call('PATCH', `/${ID}`, {
                body: { email: '', middleName: null, departmentId: null, position: '' },
            });
            expect(useCases.update.execute).toHaveBeenCalledWith(ID, {
                email: '',
                middleName: null,
                departmentId: null,
                position: '',
            });
        });

        it('ignores a login in the body: the login is not editable', async () => {
            const res = await call('PATCH', `/${ID}`, { body: { login: 'other', position: 'X' } });
            expect(res.status).toBe(200);
            expect(useCases.update.execute).toHaveBeenCalledWith(ID, { position: 'X' });
        });

        it('returns the updated card', async () => {
            useCases.update.execute.mockResolvedValue(employee({ position: 'X' }));
            const res = await call('PATCH', `/${ID}`, { body: { position: 'X' } });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ id: ID, position: 'X' });
        });

        it.each([
            ['blank last name', { lastName: '  ' }],
            ['null first name', { firstName: null }],
            ['too long position', { position: 'я'.repeat(201) }],
            ['bad email', { email: 'nope' }],
            ['too long department id', { departmentId: 'a'.repeat(65) }],
            ['too long scrm id', { scrmEmployeeId: 'x'.repeat(65) }],
        ])('answers 400 for %s', async (_name, payload) => {
            const res = await call('PATCH', `/${ID}`, { body: payload });
            expect(res.status).toBe(400);
            expect(useCases.update.execute).not.toHaveBeenCalled();
        });

        it('answers 409 EMAIL_TAKEN', async () => {
            useCases.update.execute.mockRejectedValue(new EmailTakenError());
            const res = await call('PATCH', `/${ID}`, { body: { email: 'a@example.com' } });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'EMAIL_TAKEN' });
        });

        it('answers 404 for an unknown employee and for an unknown department', async () => {
            useCases.update.execute.mockRejectedValueOnce(new EmployeeNotFoundError());
            expect((await call('PATCH', `/${ID}`, { body: {} })).status).toBe(404);
            useCases.update.execute.mockRejectedValueOnce(new DepartmentNotFoundError());
            expect(
                (await call('PATCH', `/${ID}`, { body: { departmentId: DEPARTMENT_ID } })).status,
            ).toBe(404);
        });
    });

    describe('PUT /admin/employees/:id/roles', () => {
        it('replaces the role set', async () => {
            const res = await call('PUT', `/${ID}/roles`, { body: { roles: ['developer'] } });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ roles: ['developer'] });
            expect(useCases.roles.execute).toHaveBeenCalledWith(ID, ['developer']);
        });

        it('accepts an empty set', async () => {
            const res = await call('PUT', `/${ID}/roles`, { body: { roles: [] } });
            expect(res.status).toBe(200);
            expect(useCases.roles.execute).toHaveBeenCalledWith(ID, []);
        });

        it.each([
            ['unknown role', { roles: ['superuser'] }],
            ['no roles field', {}],
            ['roles not an array', { roles: 'admin' }],
        ])('answers 400 for %s', async (_name, payload) => {
            expect((await call('PUT', `/${ID}/roles`, { body: payload })).status).toBe(400);
            expect(useCases.roles.execute).not.toHaveBeenCalled();
        });

        it('answers 409 LAST_ADMIN', async () => {
            useCases.roles.execute.mockRejectedValue(new LastAdminError());
            const res = await call('PUT', `/${ID}/roles`, { body: { roles: [] } });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'LAST_ADMIN' });
        });

        it('answers 404 for an unknown employee', async () => {
            useCases.roles.execute.mockRejectedValue(new EmployeeNotFoundError());
            expect((await call('PUT', `/${ID}/roles`, { body: { roles: [] } })).status).toBe(404);
        });
    });

    describe('dismiss and restore', () => {
        it('POST dismiss answers 200 with the dismissed card', async () => {
            const res = await call('POST', `/${ID}/dismiss`);
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ id: ID, isActive: false });
            expect(useCases.dismiss.execute).toHaveBeenCalledWith(ID);
        });

        it('POST dismiss answers 409 LAST_ADMIN', async () => {
            useCases.dismiss.execute.mockRejectedValue(new LastAdminError());
            const res = await call('POST', `/${ID}/dismiss`);
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'LAST_ADMIN' });
        });

        it('POST dismiss answers 404 for an unknown employee', async () => {
            useCases.dismiss.execute.mockRejectedValue(new EmployeeNotFoundError());
            expect((await call('POST', `/${ID}/dismiss`)).status).toBe(404);
        });

        it('POST restore answers 200 with the active card', async () => {
            const res = await call('POST', `/${ID}/restore`);
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ id: ID, isActive: true });
            expect(useCases.restore.execute).toHaveBeenCalledWith(ID);
        });

        it('POST restore answers 404 for an unknown employee', async () => {
            useCases.restore.execute.mockRejectedValue(new EmployeeNotFoundError());
            expect((await call('POST', `/${ID}/restore`)).status).toBe(404);
        });

        it('has no way to delete an employee', async () => {
            expect((await call('DELETE', `/${ID}`)).status).toBe(404);
        });
    });
});
