import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();
    const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Audit Agent API').setVersion('0.1.0').build(),
    );
    app.getHttpAdapter().get('/openapi.json', (_req, res) => res.json(document));
    app.use('/docs', apiReference({ content: document }));
    const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
    await app.listen(port);
}
void bootstrap();
