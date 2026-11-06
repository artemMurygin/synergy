import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextMiddleware } from '../../../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../../../shared/http/http-exception.filter';
import { ChangePasswordUseCase } from '../../application/change-password.use-case';
import { GetCurrentUserUseCase } from '../../application/get-current-user.use-case';
import { LoginThrottler, LoginThrottlerLimits } from '../../application/login-throttler';
import { LoginUseCase } from '../../application/login.use-case';
import { LogoutUseCase } from '../../application/logout.use-case';
import { RefreshSessionUseCase } from '../../application/refresh-session.use-case';
import {
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    RefreshRaceError,
    WeakPasswordError,
    WrongPasswordError,
} from '../../domain/errors';
import { AccessTokenService } from '../../domain/ports/access-token-service.port';
import { AuthSettings } from '../../domain/ports/auth-settings.port';
import { LoginAttemptStore } from '../../domain/ports/login-attempt-store.port';
import { JwtAccessTokenService } from '../../infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../auth-error-status';
import { AuthHttpSettings } from '../auth-http.settings';
import { AuthController } from './auth.controller';
import { AllowPendingPasswordChange, Public } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { OriginGuard } from './origin.guard';
import { PasswordChangeGuard } from './password-change.guard';
import { RefreshCookieService } from './refresh-cookie.service';
import { InMemoryLoginAttemptStore } from './testing/in-memory-login-attempt-store';

const ORIGIN = 'chrome-extension://abc';
const SECRET = 's'.repeat(40);

@Controller('probe')
class ProbeController {
    @Get()
    protectedRoute(): { ok: true } {
        return { ok: true };
    }

    @Get('public')
    @Public()
    publicRoute(): { ok: true } {
        return { ok: true };
    }

    @Get('pending-ok')
    @AllowPendingPasswordChange()
    pendingOk(): { ok: true } {
        return { ok: true };
    }
}

const pair = { access: 'acc', expiresIn: 900, refresh: 'refresh-1', mustChangePassword: false };
const login = { execute: vi.fn() };
const refresh = { execute: vi.fn() };
const logout = { execute: vi.fn() };
const changePassword = { execute: vi.fn() };
const currentUser = { execute: vi.fn() };
const store = new InMemoryLoginAttemptStore();
const fakeLogger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('AuthController', () => {
    let app: INestApplication;
    let base: string;
    const tokens = new JwtAccessTokenService({
        secret: SECRET,
        ttlSeconds: 900,
        clock: { now: () => new Date() },
    });

    beforeAll(async () => {
        registerAuthErrorStatuses();
        const moduleRef = await Test.createTestingModule({
            controllers: [AuthController, ProbeController],
            providers: [
                { provide: LoginUseCase, useValue: login },
                { provide: RefreshSessionUseCase, useValue: refresh },
                { provide: LogoutUseCase, useValue: logout },
                { provide: ChangePasswordUseCase, useValue: changePassword },
                { provide: GetCurrentUserUseCase, useValue: currentUser },
                { provide: AccessTokenService, useValue: tokens },
                { provide: AuthSettings, useValue: { refreshTtlMs: 3_600_000, refreshGraceMs: 0 } },
                {
                    provide: AuthHttpSettings,
                    useValue: { allowedOrigins: [ORIGIN] },
                },
                { provide: LoginThrottlerLimits, useValue: { maxAttempts: 2, windowMs: 60_000 } },
                { provide: LoginAttemptStore, useValue: store },
                LoginThrottler,
                LoginThrottlerGuard,
                OriginGuard,
                RefreshCookieService,
                { provide: APP_GUARD, useClass: JwtAuthGuard },
                { provide: APP_GUARD, useClass: PasswordChangeGuard },
                { provide: APP_FILTER, useClass: HttpExceptionFilter },
                { provide: PinoLogger, useValue: fakeLogger },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
        app.use(cookieParser());
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        store.reset();
        login.execute.mockResolvedValue(pair);
        refresh.execute.mockResolvedValue({ ...pair, refresh: 'refresh-2' });
        logout.execute.mockResolvedValue(undefined);
        changePassword.execute.mockResolvedValue({ ...pair, refresh: 'refresh-3' });
        currentUser.execute.mockResolvedValue({
            id: 'u1',
            login: 'anna',
            mustChangePassword: false,
        });
    });

    function call(
        method: string,
        path: string,
        init: { headers?: Record<string, string>; body?: unknown } = {},
    ): Promise<Response> {
        return fetch(`${base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...init.headers },
            ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        });
    }

    function bearer(opts: { mcp?: boolean } = {}): Record<string, string> {
        const { token } = tokens.sign({ sub: 'u1', sid: 's1', mcp: opts.mcp ?? false });
        return { authorization: `Bearer ${token}` };
    }

    async function errorOf(response: Response): Promise<Record<string, unknown>> {
        return (await response.json()) as Record<string, unknown>;
    }

    describe('POST /auth/login', () => {
        const credentials = { login: 'anna', password: 'pw' };

        it('gives a cookie client the refresh token only in Set-Cookie', async () => {
            const response = await call('POST', '/auth/login', { body: credentials });

            expect(response.status).toBe(200);
            const body = (await response.json()) as Record<string, unknown>;
            expect(body).toEqual({ accessToken: 'acc', expiresIn: 900, mustChangePassword: false });
            const cookies = response.headers.getSetCookie();
            expect(cookies).toHaveLength(1);
            expect(cookies[0]).toContain('mh_refresh=refresh-1');
            expect(cookies[0]).toContain('HttpOnly');
            expect(cookies[0]).toContain('SameSite=Strict');
            expect(cookies[0]).toContain('Path=/auth');
            expect(login.execute).toHaveBeenCalledWith('anna', 'pw');
        });

        it('gives a desktop client the refresh token in the body without a cookie', async () => {
            const response = await call('POST', '/auth/login', {
                headers: { 'x-client-type': 'desktop' },
                body: credentials,
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                accessToken: 'acc',
                expiresIn: 900,
                mustChangePassword: false,
                refreshToken: 'refresh-1',
            });
            expect(response.headers.getSetCookie()).toHaveLength(0);
        });

        it('rejects an unknown X-Client-Type with 422', async () => {
            const response = await call('POST', '/auth/login', {
                headers: { 'x-client-type': 'toaster' },
                body: credentials,
            });

            expect(response.status).toBe(422);
            expect(await errorOf(response)).toMatchObject({ code: 'INVALID_CLIENT_TYPE' });
            expect(login.execute).not.toHaveBeenCalled();
        });

        it('rejects a malformed body with 400', async () => {
            const response = await call('POST', '/auth/login', { body: { login: 'anna' } });
            expect(response.status).toBe(400);
        });

        it('answers 401 INVALID_CREDENTIALS and then 429 with the wait time', async () => {
            login.execute.mockRejectedValue(new InvalidCredentialsError());

            const first = await call('POST', '/auth/login', { body: credentials });
            expect(first.status).toBe(401);
            expect(await errorOf(first)).toMatchObject({ code: 'INVALID_CREDENTIALS' });
            await call('POST', '/auth/login', { body: credentials });
            login.execute.mockClear();

            const limited = await call('POST', '/auth/login', { body: credentials });

            expect(limited.status).toBe(429);
            expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
            expect(await errorOf(limited)).toMatchObject({ code: 'RATE_LIMITED' });
            expect(login.execute).not.toHaveBeenCalled();
        });
    });

    describe('POST /auth/login throttling', () => {
        const credentials = { login: 'anna', password: 'pw' };

        it('does not count successful logins against the limit', async () => {
            for (let i = 0; i < 4; i += 1) {
                expect((await call('POST', '/auth/login', { body: credentials })).status).toBe(200);
            }
        });

        it('stops a parallel burst at the limit before the password is checked', async () => {
            login.execute.mockRejectedValue(new InvalidCredentialsError());

            const responses = await Promise.all(
                Array.from({ length: 12 }, () =>
                    call('POST', '/auth/login', { body: credentials }),
                ),
            );

            expect(login.execute).toHaveBeenCalledTimes(2);
            expect(responses.filter((r) => r.status === 429)).toHaveLength(10);
        });
    });

    describe('POST /auth/refresh', () => {
        it('rotates by the cookie for an allowed Origin and sets the new cookie', async () => {
            const response = await call('POST', '/auth/refresh', {
                headers: { origin: ORIGIN, cookie: 'mh_refresh=refresh-1' },
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                accessToken: 'acc',
                expiresIn: 900,
                mustChangePassword: false,
            });
            expect(refresh.execute).toHaveBeenCalledWith('refresh-1');
            expect(response.headers.getSetCookie()[0]).toContain('mh_refresh=refresh-2');
        });

        it.each([['https://evil.example'], [undefined]])(
            'answers 403 FORBIDDEN_ORIGIN for Origin %s before touching the token',
            async (origin) => {
                const response = await call('POST', '/auth/refresh', {
                    headers: {
                        cookie: 'mh_refresh=refresh-1',
                        ...(origin === undefined ? {} : { origin }),
                    },
                });

                expect(response.status).toBe(403);
                expect(await errorOf(response)).toMatchObject({ code: 'FORBIDDEN_ORIGIN' });
                expect(refresh.execute).not.toHaveBeenCalled();
            },
        );

        it('answers 401 TOKEN_INVALID when the cookie is missing', async () => {
            const response = await call('POST', '/auth/refresh', { headers: { origin: ORIGIN } });

            expect(response.status).toBe(401);
            expect(await errorOf(response)).toMatchObject({ code: 'TOKEN_INVALID' });
            expect(refresh.execute).not.toHaveBeenCalled();
        });

        it('takes the token from the body for a desktop client, without Origin and cookie', async () => {
            const response = await call('POST', '/auth/refresh', {
                headers: { 'x-client-type': 'desktop' },
                body: { refreshToken: 'from-body' },
            });

            expect(response.status).toBe(200);
            expect(refresh.execute).toHaveBeenCalledWith('from-body');
            expect(await response.json()).toMatchObject({ refreshToken: 'refresh-2' });
            expect(response.headers.getSetCookie()).toHaveLength(0);
        });

        it('ignores the cookie for a desktop client', async () => {
            const response = await call('POST', '/auth/refresh', {
                headers: { 'x-client-type': 'desktop', cookie: 'mh_refresh=cookie-token' },
                body: {},
            });

            expect(response.status).toBe(401);
            expect(refresh.execute).not.toHaveBeenCalled();
        });

        it('rejects an unknown X-Client-Type with 422 ahead of the Origin check', async () => {
            const response = await call('POST', '/auth/refresh', {
                headers: { 'x-client-type': 'toaster' },
            });
            expect(response.status).toBe(422);
        });

        it('maps REFRESH_RACE to 409 and TOKEN_INVALID to 401', async () => {
            const headers = { origin: ORIGIN, cookie: 'mh_refresh=refresh-1' };
            refresh.execute.mockRejectedValueOnce(new RefreshRaceError());
            const race = await call('POST', '/auth/refresh', { headers });
            expect(race.status).toBe(409);
            expect(await errorOf(race)).toMatchObject({ code: 'REFRESH_RACE' });

            refresh.execute.mockRejectedValueOnce(new InvalidRefreshTokenError());
            const invalid = await call('POST', '/auth/refresh', { headers });
            expect(invalid.status).toBe(401);
            expect(await errorOf(invalid)).toMatchObject({ code: 'TOKEN_INVALID' });
        });
    });

    describe('POST /auth/logout', () => {
        it('revokes by the cookie, clears it and answers 204', async () => {
            const response = await call('POST', '/auth/logout', {
                headers: { origin: ORIGIN, cookie: 'mh_refresh=refresh-1' },
            });

            expect(response.status).toBe(204);
            expect(logout.execute).toHaveBeenCalledWith('refresh-1');
            const cleared = response.headers.getSetCookie()[0];
            expect(cleared).toContain('mh_refresh=;');
            expect(cleared).toContain('Path=/auth');
        });

        it('rejects a foreign Origin with 403 and does not revoke', async () => {
            const response = await call('POST', '/auth/logout', {
                headers: { origin: 'https://evil.example', cookie: 'mh_refresh=refresh-1' },
            });

            expect(response.status).toBe(403);
            expect(logout.execute).not.toHaveBeenCalled();
        });

        it('takes the token from the body for a desktop client and sets no cookie', async () => {
            const response = await call('POST', '/auth/logout', {
                headers: { 'x-client-type': 'desktop' },
                body: { refreshToken: 'from-body' },
            });

            expect(response.status).toBe(204);
            expect(logout.execute).toHaveBeenCalledWith('from-body');
            expect(response.headers.getSetCookie()).toHaveLength(0);
        });
    });

    describe('POST /auth/change-password', () => {
        const body = { currentPassword: 'old', newPassword: 'new-password-1' };

        it('changes the password of the token owner and issues a new pair', async () => {
            const response = await call('POST', '/auth/change-password', {
                headers: bearer({ mcp: true }),
                body,
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                accessToken: 'acc',
                expiresIn: 900,
                mustChangePassword: false,
            });
            expect(changePassword.execute).toHaveBeenCalledWith(
                'u1',
                's1',
                'old',
                'new-password-1',
            );
            expect(response.headers.getSetCookie()[0]).toContain('mh_refresh=refresh-3');
        });

        it('returns the new refresh token in the body for a desktop client', async () => {
            const response = await call('POST', '/auth/change-password', {
                headers: { ...bearer(), 'x-client-type': 'desktop' },
                body,
            });

            expect(await response.json()).toMatchObject({ refreshToken: 'refresh-3' });
            expect(response.headers.getSetCookie()).toHaveLength(0);
        });

        it('lists the violations of a weak password in a 422', async () => {
            changePassword.execute.mockRejectedValue(new WeakPasswordError(['too-short']));

            const response = await call('POST', '/auth/change-password', {
                headers: bearer(),
                body,
            });

            expect(response.status).toBe(422);
            expect(await errorOf(response)).toMatchObject({
                code: 'WEAK_PASSWORD',
                violations: ['too-short'],
            });
        });

        it('counts a wrong current password and answers 429 past the limit', async () => {
            changePassword.execute.mockRejectedValue(new WrongPasswordError());
            const headers = bearer();

            for (let i = 0; i < 2; i += 1) {
                const wrong = await call('POST', '/auth/change-password', { headers, body });
                expect(wrong.status).toBe(422);
                expect(await errorOf(wrong)).toMatchObject({ code: 'WRONG_PASSWORD' });
            }
            changePassword.execute.mockClear();
            const limited = await call('POST', '/auth/change-password', { headers, body });

            expect(limited.status).toBe(429);
            expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
            expect(changePassword.execute).not.toHaveBeenCalled();
        });

        it('does not count successful changes', async () => {
            for (let i = 0; i < 4; i += 1) {
                const ok = await call('POST', '/auth/change-password', {
                    headers: bearer(),
                    body,
                });
                expect(ok.status).toBe(200);
            }
        });

        it('requires a bearer token and a valid body', async () => {
            expect((await call('POST', '/auth/change-password', { body })).status).toBe(401);
            const invalid = await call('POST', '/auth/change-password', {
                headers: bearer(),
                body: { currentPassword: 'old' },
            });
            expect(invalid.status).toBe(400);
        });
    });

    describe('GET /auth/me', () => {
        it('returns the current user', async () => {
            const response = await call('GET', '/auth/me', { headers: bearer() });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                id: 'u1',
                login: 'anna',
                mustChangePassword: false,
            });
            expect(currentUser.execute).toHaveBeenCalledWith('u1');
        });
    });

    describe('JwtAuthGuard', () => {
        it('answers 401 TOKEN_INVALID without a token', async () => {
            const response = await call('GET', '/auth/me');
            expect(response.status).toBe(401);
            expect(await errorOf(response)).toMatchObject({ code: 'TOKEN_INVALID' });
        });

        it('answers 401 TOKEN_INVALID for a garbled token or another scheme', async () => {
            const garbled = await call('GET', '/auth/me', {
                headers: { authorization: 'Bearer abc.def.ghi' },
            });
            expect(garbled.status).toBe(401);
            expect(await errorOf(garbled)).toMatchObject({ code: 'TOKEN_INVALID' });

            const basic = await call('GET', '/auth/me', {
                headers: { authorization: 'Basic dXNlcjpwdw==' },
            });
            expect(await errorOf(basic)).toMatchObject({ code: 'TOKEN_INVALID' });
        });

        it('answers 401 TOKEN_EXPIRED for an expired token', async () => {
            const { token } = new JwtAccessTokenService({
                secret: SECRET,
                ttlSeconds: 60,
                clock: { now: () => new Date('2020-01-01T00:00:00Z') },
            }).sign({ sub: 'u1', sid: 's1', mcp: false });

            const response = await call('GET', '/auth/me', {
                headers: { authorization: `Bearer ${token}` },
            });

            expect(response.status).toBe(401);
            expect(await errorOf(response)).toMatchObject({ code: 'TOKEN_EXPIRED' });
        });

        it('lets @Public() routes through without a token', async () => {
            expect((await call('GET', '/probe/public')).status).toBe(200);
        });
    });

    describe('PasswordChangeGuard', () => {
        it('answers 403 PASSWORD_CHANGE_REQUIRED on other routes while a change is pending', async () => {
            const response = await call('GET', '/probe', { headers: bearer({ mcp: true }) });

            expect(response.status).toBe(403);
            expect(await errorOf(response)).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
        });

        it('lets me, change-password and routes marked @AllowPendingPasswordChange through', async () => {
            const headers = bearer({ mcp: true });
            expect((await call('GET', '/auth/me', { headers })).status).toBe(200);
            expect((await call('GET', '/probe/pending-ok', { headers })).status).toBe(200);
            const changed = await call('POST', '/auth/change-password', {
                headers,
                body: { currentPassword: 'old', newPassword: 'new-password-1' },
            });
            expect(changed.status).toBe(200);
        });

        it('lets logout through while a change is pending', async () => {
            const response = await call('POST', '/auth/logout', {
                headers: { ...bearer({ mcp: true }), origin: ORIGIN, cookie: 'mh_refresh=r' },
            });
            expect(response.status).toBe(204);
        });

        it('does not block a user without a pending change', async () => {
            expect((await call('GET', '/probe', { headers: bearer() })).status).toBe(200);
        });
    });
});
