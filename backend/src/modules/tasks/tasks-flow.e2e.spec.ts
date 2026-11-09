import { Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { AccessTokenService } from '../auth/domain/ports/access-token-service.port';
import { JwtAccessTokenService } from '../auth/infrastructure/jwt-access-token.service';
import { JwtAuthGuard } from '../auth/interface/http/jwt-auth.guard';
import { registerAuthErrorStatuses } from '../auth/interface/auth-error-status';
import {
    FakeUserDirectory,
    InMemoryAttachmentRepository,
    InMemoryTaskRepository,
} from './application/test-doubles';
import { TaskAttachmentRepository } from './domain/ports/task-attachment-repository.port';
import { TaskRepository } from './domain/ports/task-repository.port';
import { UserDirectory } from './domain/ports/user-directory.port';
import { LocalDiskFileStorage } from './infrastructure/local-disk-file-storage';
import { FileStorage } from './domain/ports/file-storage.port';
import { TasksModule } from './tasks.module';

const ANNA = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const BORIS = '5d2f6c1a-9b8e-4c7d-a1f0-3e4b5c6d7e8f';
const VERA = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SECRET = 's'.repeat(40);

const fakeLogger = {
    setContext: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
};

/** Stands in for the real pool module: no database is needed to exercise the wiring. */
@Module({})
class NoDatabaseModule {}

/** What AuthModule provides to the rest of the app: the global guard and its token service. */
@Module({
    providers: [
        {
            provide: AccessTokenService,
            useValue: new JwtAccessTokenService({
                secret: SECRET,
                ttlSeconds: 900,
                clock: { now: () => new Date() },
            }),
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        { provide: PinoLogger, useValue: fakeLogger },
    ],
    exports: [AccessTokenService],
})
class AuthStubModule {}

describe('tasks flow (TasksModule wired end to end)', () => {
    let app: INestApplication;
    let base: string;
    let storageDir: string;
    let tokens: JwtAccessTokenService;
    const attachments = new InMemoryAttachmentRepository();

    const bearer = (userId: string): Record<string, string> => {
        const { token } = tokens.sign({ sub: userId, sid: 's1', mcp: false });
        return { authorization: `Bearer ${token}` };
    };

    beforeAll(async () => {
        registerAuthErrorStatuses();
        storageDir = await mkdtemp(join(tmpdir(), 'tasks-e2e-'));
        tokens = new JwtAccessTokenService({
            secret: SECRET,
            ttlSeconds: 900,
            clock: { now: () => new Date() },
        });
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    ignoreEnvFile: true,
                    ignoreEnvVars: true,
                    load: [
                        () => ({
                            TASKS_STORAGE_DIR: storageDir,
                            TASKS_MAX_FILE_SIZE_MB: 1,
                            TASKS_MAX_FILES_PER_TASK: 2,
                        }),
                    ],
                }),
                AuthStubModule,
                TasksModule,
            ],
        })
            .overrideModule(PostgresModule)
            .useModule(NoDatabaseModule)
            .overrideProvider(TaskRepository)
            .useValue(new InMemoryTaskRepository())
            .overrideProvider(TaskAttachmentRepository)
            .useValue(attachments)
            .overrideProvider(UserDirectory)
            .useValue(
                new FakeUserDirectory([
                    { id: ANNA, login: 'anna' },
                    { id: BORIS, login: 'boris' },
                    { id: VERA, login: 'vera' },
                ]),
            )
            .compile();
        app = moduleRef.createNestApplication();
        const context = new RequestContextMiddleware();
        app.use(context.use.bind(context));
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
    });

    afterAll(async () => {
        await app.close();
        await rm(storageDir, { recursive: true, force: true });
    });

    interface Ref {
        id: string;
        login: string | null;
    }
    interface TaskBody {
        id: string;
        title: string;
        status: string;
        completedAt: string | null;
        assignee: Ref | null;
        watchers: Ref[];
        total: number;
        items: { id: string }[];
        attachments: unknown[];
    }

    const json = async (
        method: string,
        path: string,
        userId: string,
        body?: unknown,
    ): Promise<{ status: number; body: TaskBody }> => {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: { ...bearer(userId), 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return {
            status: response.status,
            body: (text === '' ? null : JSON.parse(text)) as TaskBody,
        };
    };

    it('rejects every route without a token', async () => {
        for (const [method, path] of [
            ['GET', '/tasks'],
            ['POST', '/tasks'],
            ['GET', `/tasks/${ANNA}`],
            ['PATCH', `/tasks/${ANNA}`],
            ['DELETE', `/tasks/${ANNA}`],
            ['POST', `/tasks/${ANNA}/attachments`],
            ['GET', `/tasks/${ANNA}/attachments/${BORIS}`],
            ['DELETE', `/tasks/${ANNA}/attachments/${BORIS}`],
        ] as const) {
            const response = await fetch(`${base}${path}`, { method });
            expect(response.status, `${method} ${path}`).toBe(401);
        }
    });

    it('creates, attaches, downloads, completes and finds a task', async () => {
        const created = await json('POST', '/tasks', ANNA, {
            title: 'Подготовить КП',
            assigneeId: BORIS,
            watcherIds: [VERA],
            deadline: '2030-01-01T00:00:00Z',
        });
        expect(created.status).toBe(201);
        const taskId = created.body.id;
        expect(created.body.assignee).toEqual({ id: BORIS, login: 'boris' });
        expect(created.body.watchers).toEqual([{ id: VERA, login: 'vera' }]);

        const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 10, 13, 0]);
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'Прайс 2026.pdf');
        const uploaded = await fetch(`${base}/tasks/${taskId}/attachments`, {
            method: 'POST',
            headers: bearer(BORIS),
            body: form,
        });
        expect(uploaded.status).toBe(201);
        const attachment = (await uploaded.json()) as { id: string; sizeBytes: number };
        expect(attachment.sizeBytes).toBe(bytes.length);

        const got = await json('GET', `/tasks/${taskId}`, VERA);
        expect(got.status).toBe(200);
        expect(got.body.title).toBe('Подготовить КП');
        expect(got.body.attachments).toEqual([
            expect.objectContaining({
                id: attachment.id,
                taskId,
                originalName: 'Прайс 2026.pdf',
                sizeBytes: bytes.length,
                contentType: 'application/pdf',
                uploadedBy: BORIS,
            }),
        ]);

        const downloaded = await fetch(`${base}/tasks/${taskId}/attachments/${attachment.id}`, {
            headers: bearer(VERA),
        });
        expect(downloaded.status).toBe(200);
        expect(downloaded.headers.get('content-disposition')).toContain('attachment');
        expect(Buffer.from(await downloaded.arrayBuffer()).equals(bytes)).toBe(true);

        const updated = await json('PATCH', `/tasks/${taskId}`, BORIS, { status: 'done' });
        expect(updated.status).toBe(200);
        expect(updated.body.status).toBe('done');
        expect(updated.body.completedAt).not.toBeNull();

        const found = await json(
            'GET',
            `/tasks?status=done&assigneeId=${BORIS}&watcherId=${VERA}&creatorId=${ANNA}&search=кп&overdue=false`,
            ANNA,
        );
        expect(found.status).toBe(200);
        expect(found.body.total).toBe(1);
        expect(found.body.items[0].id).toBe(taskId);

        const notDone = await json('GET', '/tasks?status=todo', ANNA);
        expect(notDone.body.items.map((t) => t.id)).not.toContain(taskId);
    });

    it('answers 404, 422 and 413 through the registered error statuses', async () => {
        expect((await json('GET', `/tasks/${ANNA}`, ANNA)).status).toBe(404);
        const noUser = await json('POST', '/tasks', ANNA, {
            title: 'x',
            assigneeId: '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f',
        });
        expect(noUser.status).toBe(422);

        const created = await json('POST', '/tasks', ANNA, { title: 'Большой файл' });
        const form = new FormData();
        form.append('file', new Blob([Buffer.alloc(1024 * 1024 + 10)]), 'big.bin');
        const tooBig = await fetch(`${base}/tasks/${created.body.id}/attachments`, {
            method: 'POST',
            headers: bearer(ANNA),
            body: form,
        });
        expect(tooBig.status).toBe(413);
    });

    it('documents every task endpoint in the OpenAPI document', () => {
        const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
        const operations = Object.entries(document.paths).flatMap(([path, item]) =>
            ['get', 'post', 'patch', 'delete']
                .filter((method) => method in item)
                .map((method) => `${method.toUpperCase()} ${path}`),
        );
        expect(operations).toEqual(
            expect.arrayContaining([
                'POST /tasks',
                'GET /tasks',
                'GET /tasks/{id}',
                'PATCH /tasks/{id}',
                'DELETE /tasks/{id}',
                'POST /tasks/{id}/attachments',
                'GET /tasks/{id}/attachments/{attachmentId}',
                'DELETE /tasks/{id}/attachments/{attachmentId}',
            ]),
        );
    });

    it('keeps FileStorage on the configured directory', () => {
        expect(app.get(FileStorage)).toBeInstanceOf(LocalDiskFileStorage);
    });
});
