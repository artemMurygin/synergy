import { describe, expect, it } from 'vitest';
import {
    DepartmentNameTakenError,
    DepartmentNotEmptyError,
    DepartmentNotFoundError,
    EmailTakenError,
    EmployeeNotFoundError,
    LastAdminError,
    LoginTakenError,
} from './errors';

describe('auth directory errors', () => {
    it.each([
        [new LastAdminError(), 'LAST_ADMIN'],
        [new EmailTakenError(), 'EMAIL_TAKEN'],
        [new LoginTakenError(), 'LOGIN_TAKEN'],
        [new DepartmentNameTakenError(), 'DEPARTMENT_NAME_TAKEN'],
        [new DepartmentNotEmptyError(), 'DEPARTMENT_NOT_EMPTY'],
        [new EmployeeNotFoundError(), 'EMPLOYEE_NOT_FOUND'],
        [new DepartmentNotFoundError(), 'DEPARTMENT_NOT_FOUND'],
    ])('%s carries its code', (error, code) => {
        expect(error.code).toBe(code);
        expect(error).toBeInstanceOf(Error);
    });
});
