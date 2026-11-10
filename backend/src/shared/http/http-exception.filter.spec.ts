import {
    Body,
    Controller,
    Get,
    HttpException,
    Post,
    type INestApplication,
    Module,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextMiddleware } from '../context/request-context.middleware';
import { NotFoundError } from '../errors';
import { HttpExceptionFilter } from './http-exception.filter';

@Controller('probe')
class ProbeController {
    @Get()
    fail(): never {
        throw new NotFoundError('probe missing');
    }
}

@Controller('echo')
class EchoController {
    @Post()
    echo(@Body() body: unknown): unknown {
        return body;
    }
}

@Controller('limited')
class LimitedController {
    @Get()
    limited(): never {
        throw new HttpException(
            { code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSeconds: 42 },
            429,
        );
    }
}

@Module({
    imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
    controllers: [ProbeController, LimitedController, EchoController],
    providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
class ProbeModule {}

describe('HttpExceptionFilter', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
        app = moduleRef.createNestApplication();
        app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
        await app.listen(0);
    });

    afterAll(async () => {
        await app.close();
    });

    it('maps NotFoundError to 404 with correlation id', async () => {
        const response = await fetch(`${await app.getUrl()}/probe`, {
            headers: { 'x-correlation-id': 'corr-1' },
        });
        expect(response.status).toBe(404);
        const body: unknown = await response.json();
        expect(body).toMatchObject({
            statusCode: 404,
            message: 'probe missing',
            error: 'GENERIC.NOT_FOUND',
            correlationId: 'corr-1',
        });
        expect(response.headers.get('x-request-id')).not.toBe('corr-1');
        expect(response.headers.get('x-correlation-id')).toBe('corr-1');
    });

    it('passes the code and extra fields of an HttpException body through', async () => {
        const response = await fetch(`${await app.getUrl()}/limited`);
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('42');
        expect(await response.json()).toMatchObject({
            statusCode: 429,
            code: 'RATE_LIMITED',
            message: 'Too many attempts',
            retryAfterSeconds: 42,
        });
    });

    it('exposes the code of a BaseError next to the legacy error field', async () => {
        const response = await fetch(`${await app.getUrl()}/probe`);
        expect(await response.json()).toMatchObject({
            code: 'GENERIC.NOT_FOUND',
            error: 'GENERIC.NOT_FOUND',
        });
    });

    const postJson = async (body: string): Promise<Response> =>
        fetch(`${await app.getUrl()}/echo`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        });

    it('answers 413 for a body above the parser limit, not 500', async () => {
        const response = await postJson(JSON.stringify({ text: 'a'.repeat(200_000) }));
        expect(response.status).toBe(413);
        expect(await response.json()).toMatchObject({ statusCode: 413, code: 'entity.too.large' });
    });

    it('answers 400 for malformed JSON, not 500', async () => {
        const response = await postJson('{"text":');
        expect(response.status).toBe(400);
    });
});
