import type { INestApplication, Provider, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RequestContextMiddleware } from '../../../../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../../../../shared/http/http-exception.filter';
import { AccessTokenService } from '../../../../auth/domain/ports/access-token-service.port';
import { JwtAccessTokenService } from '../../../../auth/infrastructure/jwt-access-token.service';
import { JwtAuthGuard } from '../../../../auth/interface/http/jwt-auth.guard';
import { registerAuthErrorStatuses } from '../../../../auth/interface/auth-error-status';
import { registerFileErrorStatuses } from '../../files-error-status';

export const USER_ID = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';

const SECRET = 's'.repeat(40);
const fakeLogger = {
    setContext: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
};

export interface HttpFixture {
    app: INestApplication;
    base: string;
    bearer(): Record<string, string>;
}

/** Настоящие JwtAuthGuard и фильтр ошибок вокруг контроллера; use case'ы — фейки. */
export async function startHttpFixture(options: {
    controllers: Type[];
    providers: Provider[];
}): Promise<HttpFixture> {
    registerAuthErrorStatuses();
    registerFileErrorStatuses();
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
            { provide: APP_FILTER, useClass: HttpExceptionFilter },
            { provide: PinoLogger, useValue: fakeLogger },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
    await app.listen(0);
    const base = (await app.getUrl()).replace('[::1]', 'localhost');
    const { token } = tokens.sign({ sub: USER_ID, sid: 's1', mcp: false });
    return { app, base, bearer: () => ({ authorization: `Bearer ${token}` }) };
}
