import type { INestApplication, Provider, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RequestContextMiddleware } from '../../../../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../../../../shared/http/http-exception.filter';
import { AccessTokenService } from '../../../../auth/domain/ports/access-token-service.port';
import { JwtAccessTokenService } from '../../../../auth/infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../../../../auth/interface/auth-error-status';
import { JwtAuthGuard } from '../../../../auth/interface/http/jwt-auth.guard';
import { PasswordChangeGuard } from '../../../../auth/interface/http/password-change.guard';
import { registerTelegramErrorStatuses } from '../../telegram-error-status';

const SECRET = 's'.repeat(40);
const ACCESS_TTL_SECONDS = 900;

export interface TelegramHttpRequest {
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
}

export interface TelegramHttpFixture {
    readonly app: INestApplication;
    readonly base: string;
    bearer(userId: string): Record<string, string>;
    call(method: string, path: string, request?: TelegramHttpRequest): Promise<Response>;
}

export async function startTelegramHttpFixture(options: {
    controllers: Type[];
    providers: Provider[];
    logger?: PinoLogger;
}): Promise<TelegramHttpFixture> {
    registerAuthErrorStatuses();
    registerTelegramErrorStatuses();
    const tokens = new JwtAccessTokenService({
        secret: SECRET,
        ttlSeconds: ACCESS_TTL_SECONDS,
        clock: { now: () => new Date() },
    });
    const moduleRef = await Test.createTestingModule({
        controllers: options.controllers,
        providers: [
            ...options.providers,
            { provide: AccessTokenService, useValue: tokens },
            { provide: APP_GUARD, useClass: JwtAuthGuard },
            { provide: APP_GUARD, useClass: PasswordChangeGuard },
            { provide: APP_FILTER, useClass: HttpExceptionFilter },
            {
                provide: PinoLogger,
                useValue: options.logger ?? new PinoLogger({ pinoHttp: { level: 'silent' } }),
            },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    const requestContext = new RequestContextMiddleware();
    app.use(requestContext.use.bind(requestContext));
    await app.listen(0);
    const base = (await app.getUrl()).replace('[::1]', 'localhost');
    return {
        app,
        base,
        bearer: (userId) => {
            const { token } = tokens.sign({ sub: userId, sid: 'session-1', mcp: false });
            return { authorization: `Bearer ${token}` };
        },
        call: (method, path, request = {}) =>
            fetch(`${base}${path}`, {
                method,
                headers: {
                    ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...request.headers,
                },
                ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
            }),
    };
}
