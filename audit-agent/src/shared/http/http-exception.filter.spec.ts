import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
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

@Module({
    controllers: [ProbeController],
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
});
