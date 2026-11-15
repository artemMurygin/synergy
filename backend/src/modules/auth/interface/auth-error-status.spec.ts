import { Controller, Get, type INestApplication, Module, Param } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextMiddleware } from '../../../shared/context/request-context.middleware';
import { BaseError } from '../../../shared/errors';
import { HttpExceptionFilter } from '../../../shared/http/http-exception.filter';
import {
    InvalidCredentialsError,
    ForbiddenError,
    ForbiddenOriginError,
    LastAdminError,
    EmailTakenError,
    LoginTakenError,
    DepartmentNameTakenError,
    ProfileIncompleteError,
    DepartmentNotEmptyError,
    EmployeeNotFoundError,
    DepartmentNotFoundError,
    InvalidRefreshTokenError,
    PasswordChangeRequiredError,
    RateLimitedError,
    RefreshRaceError,
    SamePasswordError,
    WeakPasswordError,
    WrongPasswordError,
} from '../domain/errors';
import { registerAuthErrorStatuses } from './auth-error-status';

const FACTORIES: Record<string, () => Error> = {
    credentials: () => new InvalidCredentialsError(),
    token: () => new InvalidRefreshTokenError(),
    race: () => new RefreshRaceError(),
    required: () => new PasswordChangeRequiredError(),
    wrong: () => new WrongPasswordError(),
    same: () => new SamePasswordError(),
    weak: () => new WeakPasswordError(['too-short', 'no-digit']),
    limited: () => new RateLimitedError(42),
    origin: () => new ForbiddenOriginError(),
    forbidden: () => new ForbiddenError(),
    lastAdmin: () => new LastAdminError(),
    emailTaken: () => new EmailTakenError(),
    loginTaken: () => new LoginTakenError(),
    departmentNameTaken: () => new DepartmentNameTakenError(),
    departmentNotEmpty: () => new DepartmentNotEmptyError(),
    employeeNotFound: () => new EmployeeNotFoundError(),
    departmentNotFound: () => new DepartmentNotFoundError(),
    profileIncomplete: () => new ProfileIncompleteError(),
};

@Controller('probe')
class ProbeController {
    @Get(':kind')
    fail(@Param('kind') kind: string): never {
        throw FACTORIES[kind]();
    }
}

@Module({
    imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
    controllers: [ProbeController],
    providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
class ProbeModule {}

describe('auth domain errors over HTTP', () => {
    let app: INestApplication;
    let url: string;

    beforeAll(async () => {
        registerAuthErrorStatuses();
        const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
        app = moduleRef.createNestApplication();
        app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
        await app.listen(0);
        url = await app.getUrl();
    });

    afterAll(async () => {
        await app.close();
    });

    it.each([
        ['credentials', 401, 'INVALID_CREDENTIALS'],
        ['token', 401, 'TOKEN_INVALID'],
        ['race', 409, 'REFRESH_RACE'],
        ['required', 403, 'PASSWORD_CHANGE_REQUIRED'],
        ['wrong', 422, 'WRONG_PASSWORD'],
        ['same', 422, 'SAME_PASSWORD'],
        ['weak', 422, 'WEAK_PASSWORD'],
        ['limited', 429, 'RATE_LIMITED'],
        ['origin', 403, 'FORBIDDEN_ORIGIN'],
        ['forbidden', 403, 'FORBIDDEN'],
        ['lastAdmin', 409, 'LAST_ADMIN'],
        ['emailTaken', 409, 'EMAIL_TAKEN'],
        ['loginTaken', 409, 'LOGIN_TAKEN'],
        ['departmentNameTaken', 409, 'DEPARTMENT_NAME_TAKEN'],
        ['profileIncomplete', 400, 'PROFILE_INCOMPLETE'],
        ['departmentNotEmpty', 409, 'DEPARTMENT_NOT_EMPTY'],
        ['employeeNotFound', 404, 'EMPLOYEE_NOT_FOUND'],
        ['departmentNotFound', 404, 'DEPARTMENT_NOT_FOUND'],
    ])('%s answers %i with code %s', async (kind, status, code) => {
        expect(FACTORIES[kind]()).toBeInstanceOf(BaseError);

        const response = await fetch(`${url}/probe/${kind}`);

        expect(response.status).toBe(status);
        const body: unknown = await response.json();
        expect(body).toMatchObject({ statusCode: status, code, error: code });
        expect(body).toHaveProperty('message');
    });

    it('sets Retry-After and retryAfterSeconds for a rate-limited request', async () => {
        const response = await fetch(`${url}/probe/limited`);
        expect(response.headers.get('retry-after')).toBe('42');
        expect(await response.json()).toMatchObject({ retryAfterSeconds: 42 });
    });

    it('lists the policy violations of a weak password', async () => {
        const body: unknown = await (await fetch(`${url}/probe/weak`)).json();
        expect(body).toMatchObject({ violations: ['too-short', 'no-digit'] });
    });
});
