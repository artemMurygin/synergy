import 'reflect-metadata';
import type { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './shared/config/env.schema';
import { configureHttp } from './shared/http/configure-http';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();
    const config = app.get(ConfigService<Env, true>);
    configureHttp(app, {
        allowedOrigins: config.get('AUTH_ALLOWED_ORIGINS', { infer: true }),
        trustProxy: config.get('TRUST_PROXY', { infer: true }),
    });
    const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Audit Agent API').setVersion('0.1.0').build(),
    );
    app.use('/openapi.json', (_req: Request, res: Response) => {
        res.json(document);
    });
    app.use('/docs', apiReference({ content: document }));
    const port = config.get('PORT', { infer: true });
    await app.listen(port);
}
void bootstrap();
