import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Client } from 'pg';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenService } from '../auth/domain/ports/access-token-service.port';
import { JwtAccessTokenService } from '../auth/infrastructure/jwt-access-token.service';
import { registerAuthErrorStatuses } from '../auth/interface/auth-error-status';
import { JwtAuthGuard } from '../auth/interface/http/jwt-auth.guard';
import { PasswordChangeGuard } from '../auth/interface/http/password-change.guard';
import { TasksModule } from '../tasks/tasks.module';
import { TASK_ASSIGNED_ON_CREATE_SUBSCRIBER } from './application/task-created.subscriber';
import { RealtimeChannel } from './infrastructure/realtime-channel';
import { TestClient } from './interface/ws/testing/realtime-gateway-fixture';
import { NotificationsModule } from './notifications.module';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const SECRET = 's'.repeat(40);
const ACCESS_TTL_SECONDS = 900;
const DELIVERY_DEADLINE_MS = 2_000;
const RETRY_DEADLINE_MS = 6_000;
const QUIET_PERIOD_MS = 300;

const notificationCreatedSchema = z.object({
    notification: z.object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        body: z.string(),
        target: z.object({ type: z.string(), id: z.string() }),
        actorId: z.string().nullable(),
        readAt: z.string().nullable(),
    }),
    unreadCount: z.number(),
});

const createdTaskSchema = z.object({ id: z.string() });

const notificationPageSchema = z.object({
    total: z.number(),
    items: z.array(z.object({ id: z.string(), title: z.string() })),
});

const tokens = new JwtAccessTokenService({
    secret: SECRET,
    ttlSeconds: ACCESS_TTL_SECONDS,
    clock: { now: () => new Date() },
});

@Module({
    providers: [
        { provide: AccessTokenService, useValue: tokens },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PasswordChangeGuard },
    ],
    exports: [AccessTokenService],
})
class AuthStubModule {}

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${what} did not happen within ${String(ms)} ms`));
        }, ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        );
    });
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(adminUrl === undefined)('notifications flow (modules wired end to end)', () => {
    const databaseName = `notifications_flow_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let app: INestApplication;
    let client: Client;
    let base: string;
    let storageDir: string;
    let anna: string;
    let boris: string;
    const sockets: ClientSocket[] = [];

    const bearer = (userId: string): Record<string, string> => ({
        authorization: `Bearer ${tokens.sign({ sub: userId, sid: 'session-1', mcp: false }).token}`,
    });

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    function connect(userId: string): Promise<TestClient> {
        return new Promise((resolve, reject) => {
            const socket = io(`${base}/notifications`, {
                transports: ['websocket'],
                reconnection: false,
                forceNew: true,
                auth: { token: tokens.sign({ sub: userId, sid: 'session-1', mcp: false }).token },
            });
            sockets.push(socket);
            const testClient = new TestClient(socket);
            socket.once('connect', () => {
                resolve(testClient);
            });
            socket.once('connect_error', reject);
        });
    }

    async function createTask(actorId: string, body: Record<string, unknown>): Promise<string> {
        const response = await fetch(`${base}/tasks`, {
            method: 'POST',
            headers: { ...bearer(actorId), 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        expect(response.status).toBe(201);
        return createdTaskSchema.parse(await response.json()).id;
    }

    async function waitForSourceDelivery(taskId: string): Promise<void> {
        const deadline = Date.now() + RETRY_DEADLINE_MS;
        while (Date.now() < deadline) {
            const result = await client.query<{ status: string }>(
                `SELECT d.status FROM outbox_deliveries d
                 JOIN outbox_events e ON e.id = d.event_id
                 WHERE e.aggregate_id = $1 AND d.subscriber = $2`,
                [taskId, TASK_ASSIGNED_ON_CREATE_SUBSCRIBER],
            );
            if (result.rows[0]?.status === 'done') return;
            await pause(50);
        }
        throw new Error(`Source event of task ${taskId} was not processed`);
    }

    beforeAll(async () => {
        if (adminUrl === undefined) return;
        registerAuthErrorStatuses();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl, databaseName);
        storageDir = await mkdtemp(join(tmpdir(), 'notifications-flow-'));
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    ignoreEnvFile: true,
                    ignoreEnvVars: true,
                    load: [
                        () => ({
                            NODE_ENV: 'test',
                            POSTGRES_URL: databaseUrl,
                            TASKS_STORAGE_DIR: storageDir,
                            TASKS_MAX_FILE_SIZE_MB: 1,
                            TASKS_MAX_FILES_PER_TASK: 2,
                            OUTBOX_POLL_INTERVAL_MS: 100,
                            OUTBOX_BATCH_SIZE: 20,
                            OUTBOX_MAX_ATTEMPTS: 5,
                            OUTBOX_RETENTION_DAYS: 7,
                            AUTH_ALLOWED_ORIGINS: [],
                            NOTIFICATIONS_WS_PING_INTERVAL_MS: 20_000,
                        }),
                    ],
                }),
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                OutboxModule,
                TasksModule,
                NotificationsModule,
            ],
            providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
        })
            .overrideModule(AuthModule)
            .useModule(AuthStubModule)
            .compile();
        app = moduleRef.createNestApplication({ logger: false });
        const requestContext = new RequestContextMiddleware();
        app.use(requestContext.use.bind(requestContext));
        app.useWebSocketAdapter(new IoAdapter(app));
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
        client = new Client({ connectionString: databaseUrl });
        await client.connect();
        anna = await addUser('anna');
        boris = await addUser('boris');
    }, 60_000);

    afterAll(async () => {
        for (const socket of sockets) socket.disconnect();
        await app.close();
        await client.end();
        await rm(storageDir, { recursive: true, force: true });
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    it('delivers a task assignment to every connection of the assignee and syncs reading', async () => {
        const annaConnection = await connect(anna);
        const borisDesktop = await connect(boris);
        const borisExtension = await connect(boris);

        const taskId = await createTask(anna, { title: 'Подготовить КП', assigneeId: boris });

        const [onDesktop, onExtension] = await within(
            Promise.all([
                borisDesktop.nextEvent('notification.created'),
                borisExtension.nextEvent('notification.created'),
            ]),
            DELIVERY_DEADLINE_MS,
            'notification.created on both connections of boris',
        );
        const delivered = notificationCreatedSchema.parse(onDesktop);
        expect(notificationCreatedSchema.parse(onExtension)).toEqual(delivered);
        expect(delivered).toMatchObject({
            unreadCount: 1,
            notification: {
                type: 'task.assigned',
                title: 'Вам назначена задача',
                body: 'anna назначил вас ответственным: Подготовить КП',
                target: { type: 'task', id: taskId },
                actorId: anna,
                readAt: null,
            },
        });
        await pause(QUIET_PERIOD_MS);
        expect(annaConnection.events).toEqual([]);

        const listResponse = await fetch(`${base}/notifications`, { headers: bearer(boris) });
        expect(listResponse.status).toBe(200);
        expect(notificationPageSchema.parse(await listResponse.json())).toMatchObject({
            total: 1,
            items: [{ id: delivered.notification.id, title: 'Вам назначена задача' }],
        });

        const readResponse = await fetch(
            `${base}/notifications/${delivered.notification.id}/read`,
            { method: 'POST', headers: bearer(boris) },
        );
        expect(readResponse.status).toBe(200);
        expect(await readResponse.json()).toEqual({ unreadCount: 0 });
        const readSync = await within(
            borisExtension.nextEvent('notification.read'),
            DELIVERY_DEADLINE_MS,
            'notification.read on the second connection of boris',
        );
        expect(readSync).toEqual({
            notificationIds: [delivered.notification.id],
            unreadCount: 0,
        });
    });

    it('creates no notification for a task assigned to its creator', async () => {
        const annaConnection = await connect(anna);

        const taskId = await createTask(anna, { title: 'Себе', assigneeId: anna });
        await waitForSourceDelivery(taskId);
        await pause(QUIET_PERIOD_MS);

        const countResponse = await fetch(`${base}/notifications/unread-count`, {
            headers: bearer(anna),
        });
        expect(await countResponse.json()).toEqual({ unreadCount: 0 });
        expect(annaConnection.events).toEqual([]);
    });

    it('delivers the notification after a retry when the realtime channel fails once', async () => {
        const borisConnection = await connect(boris);
        const channel = app.get(RealtimeChannel);
        const deliver = vi
            .spyOn(channel, 'deliver')
            .mockRejectedValueOnce(new Error('realtime server is down'));

        await createTask(anna, { title: 'После сбоя', assigneeId: boris });

        const payload = notificationCreatedSchema.parse(
            await within(
                borisConnection.nextEvent('notification.created'),
                RETRY_DEADLINE_MS,
                'notification.created after the retry',
            ),
        );
        expect(payload.notification.body).toBe('anna назначил вас ответственным: После сбоя');
        expect(deliver).toHaveBeenCalledTimes(2);
        deliver.mockRestore();
    }, 10_000);
});
