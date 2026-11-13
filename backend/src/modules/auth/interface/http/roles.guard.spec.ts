import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RequestContextMiddleware } from '../../../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../../../shared/http/http-exception.filter';
import { AccessTokenService } from '../../domain/ports/access-token-service.port';
import type { Role } from '../../domain/role';
import { JwtAccessTokenService } from '../../infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../auth-error-status';
import { Roles } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Controller('probe')
class ProbeController {
    @Get('open')
    open(): { ok: true } {
        return { ok: true };
    }

    @Get('dev')
    @Roles('developer')
    dev(): { ok: true } {
        return { ok: true };
    }
}

describe('RolesGuard', () => {
    let app: INestApplication;
    let base: string;
    let now = new Date();
    const tokens = new JwtAccessTokenService({
        secret: 's'.repeat(40),
        ttlSeconds: 900,
        clock: { now: () => now },
    });
    const fakeLogger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    beforeAll(async () => {
        registerAuthErrorStatuses();
        const moduleRef = await Test.createTestingModule({
            controllers: [ProbeController],
            providers: [
                { provide: AccessTokenService, useValue: tokens },
                { provide: APP_GUARD, useClass: JwtAuthGuard },
                { provide: APP_GUARD, useClass: RolesGuard },
                { provide: APP_FILTER, useClass: HttpExceptionFilter },
                { provide: PinoLogger, useValue: fakeLogger },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
    });

    afterAll(async () => {
        await app.close();
    });

    function bearer(rol?: Role[]): Record<string, string> {
        const { token } = tokens.sign({ sub: 'u1', sid: 's1', mcp: false, rol });
        return { authorization: `Bearer ${token}` };
    }

    function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
        return fetch(`${base}${path}`, { headers });
    }

    it('lets a user with the role through', async () => {
        const response = await get('/probe/dev', bearer(['developer']));
        expect(response.status).toBe(200);
    });

    it('answers 403 FORBIDDEN when the role is missing', async () => {
        const response = await get('/probe/dev', bearer([]));
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('answers 403 for a token issued without rol at all', async () => {
        const response = await get('/probe/dev', bearer());
        expect(response.status).toBe(403);
    });

    it('answers 401 without a token, before the role check', async () => {
        const response = await get('/probe/dev');
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('does not touch an endpoint without @Roles', async () => {
        expect((await get('/probe/open', bearer([]))).status).toBe(200);
    });

    it('keeps honouring the role inside an already issued token until it expires', async () => {
        const headers = bearer(['developer']);
        // The role was revoked in the database meanwhile, but the token claims still carry it.
        expect((await get('/probe/dev', headers)).status).toBe(200);

        const expired = new JwtAccessTokenService({
            secret: 's'.repeat(40),
            ttlSeconds: 60,
            clock: { now: () => new Date('2020-01-01T00:00:00Z') },
        }).sign({ sub: 'u1', sid: 's1', mcp: false, rol: ['developer'] });
        const response = await get('/probe/dev', { authorization: `Bearer ${expired.token}` });
        expect(response.status).toBe(401);
        now = new Date();
    });
});
