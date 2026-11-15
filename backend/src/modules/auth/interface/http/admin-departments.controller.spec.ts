import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDepartmentUseCase } from '../../application/create-department.use-case';
import { DeleteDepartmentUseCase } from '../../application/delete-department.use-case';
import { ListDepartmentsUseCase } from '../../application/list-departments.use-case';
import { UpdateDepartmentUseCase } from '../../application/update-department.use-case';
import type { DepartmentView } from '../../domain/department-view';
import {
    DepartmentNameTakenError,
    DepartmentNotEmptyError,
    DepartmentNotFoundError,
    EmployeeNotFoundError,
} from '../../domain/errors';
import { AdminDepartmentsController } from './admin-departments.controller';
import { type AdminHttpFixture, startAdminHttpFixture } from './testing/admin-http-fixture';

const useCases = {
    list: { execute: vi.fn() },
    create: { execute: vi.fn() },
    update: { execute: vi.fn() },
    remove: { execute: vi.fn() },
};

const ID = randomUUID();
const HEAD_ID = randomUUID();

function department(overrides: Partial<DepartmentView> = {}): DepartmentView {
    return {
        id: ID,
        name: 'Колл-центр 1',
        head: { id: HEAD_ID, login: 'boss', fullName: 'Петров Пётр', isActive: false },
        employeeCount: 3,
        ...overrides,
    };
}

describe('AdminDepartmentsController', () => {
    let fixture: AdminHttpFixture;

    beforeAll(async () => {
        fixture = await startAdminHttpFixture({
            controllers: [AdminDepartmentsController],
            providers: [
                { provide: ListDepartmentsUseCase, useValue: useCases.list },
                { provide: CreateDepartmentUseCase, useValue: useCases.create },
                { provide: UpdateDepartmentUseCase, useValue: useCases.update },
                { provide: DeleteDepartmentUseCase, useValue: useCases.remove },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        useCases.list.execute.mockResolvedValue([department()]);
        useCases.create.execute.mockResolvedValue(department({ head: null, employeeCount: 0 }));
        useCases.update.execute.mockResolvedValue(department());
        useCases.remove.execute.mockResolvedValue(undefined);
    });

    const call = (
        method: string,
        path: string,
        options: { body?: unknown; headers?: Record<string, string> } = {},
    ): Promise<Response> =>
        fetch(`${fixture.base}/admin/departments${path}`, {
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
            ['POST', '', { name: 'Отдел' }],
            ['PATCH', `/${ID}`, { name: 'Отдел' }],
            ['DELETE', `/${ID}`],
        ];

        it.each(routes)('%s %s answers 401 without a token', async (method, path, body) => {
            expect((await call(method, path, { body, headers: {} })).status).toBe(401);
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

        it('answers 403 while the password change is pending', async () => {
            const res = await call('GET', '', {
                headers: fixture.bearer({ mustChangePassword: true }),
            });
            expect(res.status).toBe(403);
        });

        it('never reaches a use case when access is denied', async () => {
            await call('DELETE', `/${ID}`, { headers: fixture.bearer({ roles: ['developer'] }) });
            expect(Object.values(useCases).every((u) => u.execute.mock.calls.length === 0)).toBe(
                true,
            );
        });
    });

    describe('GET /admin/departments', () => {
        it('returns departments with head and employee count, without the head login', async () => {
            const res = await call('GET', '');
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual([
                {
                    id: ID,
                    name: 'Колл-центр 1',
                    head: { id: HEAD_ID, fullName: 'Петров Пётр', isActive: false },
                    employeeCount: 3,
                },
            ]);
        });

        it('returns a department without a head', async () => {
            useCases.list.execute.mockResolvedValue([department({ head: null })]);
            expect(await (await call('GET', '')).json()).toMatchObject([{ head: null }]);
        });
    });

    describe('POST /admin/departments', () => {
        it('answers 201 with the created department', async () => {
            const res = await call('POST', '', { body: { name: 'Колл-центр 1' } });
            expect(res.status).toBe(201);
            expect(await res.json()).toMatchObject({ id: ID, head: null, employeeCount: 0 });
            expect(useCases.create.execute).toHaveBeenCalledWith({ name: 'Колл-центр 1' });
        });

        it('passes the head', async () => {
            await call('POST', '', { body: { name: 'Отдел', headUserId: HEAD_ID } });
            expect(useCases.create.execute).toHaveBeenCalledWith({
                name: 'Отдел',
                headUserId: HEAD_ID,
            });
        });

        it.each([
            ['no name', {}],
            ['blank name', { name: '   ' }],
            ['too long name', { name: 'я'.repeat(201) }],
            ['malformed head id', { name: 'Отдел', headUserId: 'abc' }],
        ])('answers 400 for %s', async (_name, payload) => {
            expect((await call('POST', '', { body: payload })).status).toBe(400);
            expect(useCases.create.execute).not.toHaveBeenCalled();
        });

        it('answers 409 DEPARTMENT_NAME_TAKEN', async () => {
            useCases.create.execute.mockRejectedValue(new DepartmentNameTakenError());
            const res = await call('POST', '', { body: { name: 'Отдел' } });
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'DEPARTMENT_NAME_TAKEN' });
        });

        it('answers 404 EMPLOYEE_NOT_FOUND for a missing head', async () => {
            useCases.create.execute.mockRejectedValue(new EmployeeNotFoundError());
            const res = await call('POST', '', { body: { name: 'Отдел', headUserId: HEAD_ID } });
            expect(res.status).toBe(404);
            expect(await res.json()).toMatchObject({ code: 'EMPLOYEE_NOT_FOUND' });
        });
    });

    describe('PATCH /admin/departments/:id', () => {
        it('renames and keeps the head when only the name is sent', async () => {
            await call('PATCH', `/${ID}`, { body: { name: 'Новое' } });
            expect(useCases.update.execute).toHaveBeenCalledWith(ID, { name: 'Новое' });
        });

        it('assigns a head', async () => {
            await call('PATCH', `/${ID}`, { body: { headUserId: HEAD_ID } });
            expect(useCases.update.execute).toHaveBeenCalledWith(ID, { headUserId: HEAD_ID });
        });

        it('clears the head with null', async () => {
            await call('PATCH', `/${ID}`, { body: { headUserId: null } });
            expect(useCases.update.execute).toHaveBeenCalledWith(ID, { headUserId: null });
        });

        it.each([
            ['blank name', { name: ' ' }],
            ['too long name', { name: 'я'.repeat(201) }],
            ['malformed head id', { headUserId: 'abc' }],
        ])('answers 400 for %s', async (_name, payload) => {
            expect((await call('PATCH', `/${ID}`, { body: payload })).status).toBe(400);
            expect(useCases.update.execute).not.toHaveBeenCalled();
        });

        it('answers 409, 404 and 404 for the domain errors', async () => {
            useCases.update.execute.mockRejectedValueOnce(new DepartmentNameTakenError());
            expect((await call('PATCH', `/${ID}`, { body: { name: 'X' } })).status).toBe(409);
            useCases.update.execute.mockRejectedValueOnce(new DepartmentNotFoundError());
            const res = await call('PATCH', `/${ID}`, { body: { name: 'X' } });
            expect(res.status).toBe(404);
            expect(await res.json()).toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
            useCases.update.execute.mockRejectedValueOnce(new EmployeeNotFoundError());
            expect((await call('PATCH', `/${ID}`, { body: { headUserId: HEAD_ID } })).status).toBe(
                404,
            );
        });
    });

    describe('PATCH /admin/departments/:id with a seeded text id', () => {
        it('passes the id through', async () => {
            const res = await call('PATCH', '/dev', { body: { name: 'Разработка' } });
            expect(res.status).toBe(200);
            expect(useCases.update.execute).toHaveBeenCalledWith('dev', { name: 'Разработка' });
        });
    });

    describe('DELETE /admin/departments/:id', () => {
        it('answers 204 for an empty department', async () => {
            const res = await call('DELETE', `/${ID}`);
            expect(res.status).toBe(204);
            expect(useCases.remove.execute).toHaveBeenCalledWith(ID);
        });

        it('answers 409 DEPARTMENT_NOT_EMPTY', async () => {
            useCases.remove.execute.mockRejectedValue(new DepartmentNotEmptyError());
            const res = await call('DELETE', `/${ID}`);
            expect(res.status).toBe(409);
            expect(await res.json()).toMatchObject({ code: 'DEPARTMENT_NOT_EMPTY' });
        });

        it('answers 404 for an unknown department', async () => {
            useCases.remove.execute.mockRejectedValue(new DepartmentNotFoundError());
            expect((await call('DELETE', `/${randomUUID()}`)).status).toBe(404);
        });

        it('accepts the text id of a seeded department', async () => {
            expect((await call('DELETE', '/dev')).status).toBe(204);
            expect(useCases.remove.execute).toHaveBeenCalledWith('dev');
        });

        it('answers 400 for a too long id', async () => {
            expect((await call('DELETE', `/${'a'.repeat(65)}`)).status).toBe(400);
        });
    });
});
