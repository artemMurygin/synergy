import type { INestApplication, Provider, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RequestContextMiddleware } from '../../../../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../../../../shared/http/http-exception.filter';
import { AccessTokenService } from '../../../domain/ports/access-token-service.port';
import type { Role } from '../../../domain/role';
import { JwtAccessTokenService } from '../../../infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../../auth-error-status';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { PasswordChangeGuard } from '../password-change.guard';
import { RolesGuard } from '../roles.guard';

export const ADMIN_USER_ID = '7f3c1b2e-9d4a-4e5b-8a6c-1d2e3f4a5b6c';

const SECRET = 's'.repeat(40);
const fakeLogger = {
    setContext: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
};

export interface TokenOptions {
    roles?: Role[];
    /** mustChangePassword claim. */
    mustChangePassword?: boolean;
    userId?: string;
    sessionId?: string;
}

export interface AdminHttpFixture {
    app: INestApplication;
    base: string;
    /** Authorization header with a token carrying the given roles (admin by default). */
    bearer(options?: TokenOptions): Record<string, string>;
}

/**
 * The real guard chain of the auth module (token, forced password change, roles) and the error
 * filter around the controllers under test; use cases and ports are supplied by the test.
 */
export async function startAdminHttpFixture(options: {
    controllers: Type[];
    providers: Provider[];
}): Promise<AdminHttpFixture> {
    registerAuthErrorStatuses();
    const tokens = new JwtAccessTokenService({
        secret: SECRET,
        ttlSeconds: 900,
        clock: { now: () => new Date() },
    });
    const moduleRef = await Test.createTestingModule({
        controllers: options.controllers,
        providers: [
            ...options.providers,
            { provide: AccessTokenService, useValue: tokens },
            { provide: APP_GUARD, useClass: JwtAuthGuard },
            { provide: APP_GUARD, useClass: PasswordChangeGuard },
            { provide: APP_GUARD, useClass: RolesGuard },
            { provide: APP_FILTER, useClass: HttpExceptionFilter },
            { provide: PinoLogger, useValue: fakeLogger },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
    await app.listen(0);
    const base = (await app.getUrl()).replace('[::1]', 'localhost');
    return {
        app,
        base,
        bearer: (token = {}) => {
            const { token: signed } = tokens.sign({
                sub: token.userId ?? ADMIN_USER_ID,
                sid: token.sessionId ?? 's1',
                mcp: token.mustChangePassword ?? false,
                rol: token.roles ?? ['admin'],
            });
            return { authorization: `Bearer ${signed}` };
        },
    };
}
