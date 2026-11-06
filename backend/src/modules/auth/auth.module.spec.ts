import { Controller, Get, Global, type INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../database/postgres/database.constants';
import { configureHttp } from '../../shared/http/configure-http';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { FakeSessions, FakeUsers } from './application/test-doubles';
import { LoginAttemptStore } from './domain/ports/login-attempt-store.port';
import { AuthSessionRepository } from './domain/ports/auth-session-repository.port';
import { UserRepository } from './domain/ports/user-repository.port';
import { SeedUsersUseCase } from './application/seed-users.use-case';
import { AuthModule } from './auth.module';
import { AUTH_REDIS } from './auth.tokens';
import { InMemoryLoginAttemptStore } from './interface/http/testing/in-memory-login-attempt-store';
import { TransactionRunner } from './domain/ports/transaction-runner.port';

const ORIGIN = 'chrome-extension://abc';
const values: Record<string, unknown> = {
    JWT_SECRET: 's'.repeat(40),
    AUTH_ACCESS_TTL: '15m',
    AUTH_REFRESH_TTL: '14d',
    AUTH_REFRESH_GRACE_SECONDS: 10,
    AUTH_LOGIN_MAX_ATTEMPTS: 3,
    AUTH_LOGIN_WINDOW_MINUTES: 15,
    AUTH_ALLOWED_ORIGINS: [ORIGIN],
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_DB: 0,
};

@Global()
@Module({
    providers: [{ provide: ConfigService, useValue: { get: (key: string) => values[key] } }],
    exports: [ConfigService],
})
class FakeConfigModule {}

@Controller('probe')
class ProbeController {
    @Get()
    protectedRoute(): { ok: true } {
        return { ok: true };
    }
}

describe('AuthModule', () => {
    let app: INestApplication;
    let base: string;
    const users = new FakeUsers();

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [FakeConfigModule, AuthModule],
            controllers: [ProbeController],
            providers: [
                { provide: APP_FILTER, useClass: HttpExceptionFilter },
                {
                    provide: PinoLogger,
                    useValue: {
                        setContext: () => undefined,
                        warn: () => undefined,
                        error: () => undefined,
                        debug: () => undefined,
                    },
                },
            ],
        })
            .overrideProvider(PG_POOL)
            .useValue({ end: () => Promise.resolve() })
            .overrideProvider(AUTH_REDIS)
            .useValue({ status: 'end', disconnect: () => undefined })
            .overrideProvider(LoginAttemptStore)
            .useValue(new InMemoryLoginAttemptStore())
            .overrideProvider(UserRepository)
            .useValue(users)
            .overrideProvider(AuthSessionRepository)
            .useValue(new FakeSessions())
            .overrideProvider(TransactionRunner)
            .useValue({ run: <T>(work: () => Promise<T>): Promise<T> => work() })
            .compile();
        app = moduleRef.createNestApplication();
        app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
        configureHttp(app as never, { allowedOrigins: [ORIGIN] });
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
        await moduleRef.get(SeedUsersUseCase).execute([{ login: 'anna', password: 'temporary-1' }]);
    });

    afterAll(async () => {
        await app.close();
    });

    async function post(
        path: string,
        body: unknown,
        headers: Record<string, string> = {},
    ): Promise<Response> {
        return fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
        });
    }

    it('keeps every route closed by default, including ones from other modules', async () => {
        const response = await fetch(`${base}/probe`);
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('serves the full cookie flow end to end', async () => {
        const login = await post('/auth/login', { login: 'anna', password: 'temporary-1' });
        expect(login.status).toBe(200);
        const first = (await login.json()) as { accessToken: string; mustChangePassword: boolean };
        expect(first.mustChangePassword).toBe(true);
        const cookie = login.headers.getSetCookie()[0]?.split(';')[0] ?? '';
        expect(cookie).toMatch(/^mh_refresh=.+/);

        const blocked = await fetch(`${base}/probe`, {
            headers: { authorization: `Bearer ${first.accessToken}` },
        });
        expect(blocked.status).toBe(403);
        expect(await blocked.json()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

        const refreshed = await post('/auth/refresh', {}, { origin: ORIGIN, cookie });
        expect(refreshed.status).toBe(200);
        const rotated = refreshed.headers.getSetCookie()[0]?.split(';')[0] ?? '';
        expect(rotated).not.toBe(cookie);

        const weak = await post(
            '/auth/change-password',
            { currentPassword: 'temporary-1', newPassword: 'short' },
            { authorization: `Bearer ${first.accessToken}` },
        );
        expect(weak.status).toBe(422);
        expect(await weak.json()).toMatchObject({ code: 'WEAK_PASSWORD' });

        const logout = await post('/auth/logout', {}, { origin: ORIGIN, cookie: rotated });
        expect(logout.status).toBe(204);
        const after = await post('/auth/refresh', {}, { origin: ORIGIN, cookie: rotated });
        expect(after.status).toBe(401);
    });

    it('maps credential failures and the rate limit to the contract statuses', async () => {
        const body = { login: 'anna', password: 'wrong-password-1' };
        expect((await post('/auth/login', body, { 'x-client-type': 'desktop' })).status).toBe(401);
        expect((await post('/auth/login', body, { 'x-client-type': 'desktop' })).status).toBe(401);
        const limited = await post('/auth/login', body, { 'x-client-type': 'desktop' });
        expect(limited.status).toBe(429);
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    });

    it('rejects a refresh from a foreign origin', async () => {
        const response = await post(
            '/auth/refresh',
            {},
            { origin: 'https://evil.example', cookie: 'mh_refresh=x' },
        );
        expect(response.status).toBe(403);
    });
});
