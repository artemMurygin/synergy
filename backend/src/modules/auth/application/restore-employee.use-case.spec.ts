/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { Department } from '../domain/department';
import { DepartmentName } from '../domain/department-name';
import { EmployeeProfile } from '../domain/employee-profile';
import { EmployeeNotFoundError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { PersonName } from '../domain/person-name';
import { User } from '../domain/user';
import { RestoreEmployeeUseCase } from './restore-employee.use-case';
import {
    FakeDepartments,
    FakeEmployeeQuery,
    FakeProfiles,
    FakeUsers,
    NOW,
    fakeTx,
} from './test-doubles';

function setup(active: boolean) {
    const users = new FakeUsers();
    const profiles = new FakeProfiles();
    const departments = new FakeDepartments(profiles);
    departments.byId.set('d1', Department.create({ id: 'd1', name: DepartmentName.of('QA') }));
    const query = new FakeEmployeeQuery(users, profiles, departments);
    users.byId.set(
        'ivan',
        User.restore({
            id: 'ivan',
            login: Login.of('ivan'),
            passwordHash: PasswordHash.of('kept-hash'),
            mustChangePassword: false,
            isActive: active,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    profiles.byUserId.set(
        'ivan',
        EmployeeProfile.create({
            userId: 'ivan',
            name: PersonName.of({ lastName: 'Иванов', firstName: 'Иван' }),
            departmentId: 'd1',
            position: 'Тестировщик',
        }),
    );
    return { users, profiles, useCase: new RestoreEmployeeUseCase(users, query, fakeTx) };
}

describe('RestoreEmployeeUseCase', () => {
    it('reactivates a dismissed employee keeping the password and the profile', async () => {
        const { users, useCase } = setup(false);

        const view = await useCase.execute('ivan');

        expect(view).toMatchObject({
            isActive: true,
            fullName: 'Иванов Иван',
            position: 'Тестировщик',
            department: { id: 'd1', name: 'QA' },
        });
        expect(users.setActive).toHaveBeenCalledWith('ivan', true);
        expect(users.byId.get('ivan')?.passwordHash.value).toBe('kept-hash');
    });

    it('is idempotent: restoring an active employee succeeds without changes', async () => {
        const { users, useCase } = setup(true);

        const view = await useCase.execute('ivan');

        expect(view.isActive).toBe(true);
        expect(users.setActive).not.toHaveBeenCalled();
    });

    it('rejects an unknown employee with EmployeeNotFoundError', async () => {
        const { useCase } = setup(true);

        await expect(useCase.execute('ghost')).rejects.toBeInstanceOf(EmployeeNotFoundError);
    });
});
