import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { Client } from 'pg';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { OutboxSettings } from '../../shared/outbox/infrastructure/outbox-settings';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { QueueRootModule } from '../../shared/queue/queue-root.module';
import {
    connectTestRedis,
    disconnectTestRedis,
    testRedisOptions,
} from '../../shared/testing/test-redis';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { FindActiveUserUseCase } from '../auth/application/find-active-user.use-case';
import { AuthModule } from '../auth/auth.module';
import { UserRepository } from '../auth/domain/ports/user-repository.port';
import { AccessTokenService } from '../auth/domain/ports/access-token-service.port';
import { JwtAccessTokenService } from '../auth/infrastructure/jwt-access-token.service';
import { SlonikUserRepository } from '../auth/infrastructure/slonik-user.repository';
import { registerAuthErrorStatuses } from '../auth/interface/auth-error-status';
import { JwtAuthGuard } from '../auth/interface/http/jwt-auth.guard';
import { PasswordChangeGuard } from '../auth/interface/http/password-change.guard';
import { FindOwnedFilesUseCase } from '../files/application/find-owned-files.use-case';
import { GetFileUseCase } from '../files/application/get-file.use-case';
import { HoldFileUseCase } from '../files/application/hold-file.use-case';
import { OpenFileForProcessingUseCase } from '../files/application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from '../files/application/release-file-hold.use-case';
import { StoreGeneratedFileUseCase } from '../files/application/store-generated-file.use-case';
import { FilesModule } from '../files/files.module';
import { channelSubscriberName } from '../notifications/application/channel-delivery.subscriber';
import { TestClient } from '../notifications/interface/ws/testing/realtime-gateway-fixture';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { BotReplies } from './application/bot-replies';
import { BotApiStub, type BotApiStubReply } from './testing/bot-api-stub';
import { TEST_BOT_TOKEN, TEST_BOT_USERNAME } from './testing/telegram-settings.fixture';
import { TelegramModule } from './telegram.module';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const SECRET = 's'.repeat(40);
const ACCESS_TTL_SECONDS = 900;
const WEBHOOK_SECRET = 'w'.repeat(40);
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const TELEGRAM_SUBSCRIBER = channelSubscriberName('telegram');
const DELIVERY_DEADLINE_MS = 3_000;
const RETRY_DEADLINE_MS = 8_000;
const QUIET_PERIOD_MS = 500;
const RETRY_AFTER_SECONDS = 2;
const HANDLER_TIMEOUT_MS = 1_000;
const SLOW_SEND_MS = 2_500;
const RESERVATION_MS = 120_000;

const linkTokenSchema = z.object({ url: z.string(), expiresAt: z.string() });
const linkStatusSchema = z.object({
    isAvailable: z.boolean(),
    isLinked: z.boolean(),
    username: z.string().nullable().optional(),
    notificationsEnabled: z.boolean().optional(),
});
const createdTaskSchema = z.object({ id: z.string() });
const sendMessageBodySchema = z.object({ chat_id: z.string(), text: z.string() });
const notificationCreatedSchema = z.object({
    notification: z.object({ id: z.string(), title: z.string(), body: z.string() }),
});

const tokens = new JwtAccessTokenService({
    secret: SECRET,
    ttlSeconds: ACCESS_TTL_SECONDS,
    clock: { now: () => new Date() },
});

@Module({
    imports: [PostgresModule],
    providers: [
        { provide: AccessTokenService, useValue: tokens },
        { provide: UserRepository, useClass: SlonikUserRepository },
        FindActiveUserUseCase,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PasswordChangeGuard },
    ],
    exports: [AccessTokenService, FindActiveUserUseCase],
})
class AuthStubModule {}

/** Stands in for FilesModule (object storage, queues): the flow does not issue or transcribe files. */
@Module({
    providers: [
        {
            provide: GetFileUseCase,
            useValue: { execute: () => Promise.reject(new Error('not used in this flow')) },
        },
        {
            provide: StoreGeneratedFileUseCase,
            useValue: { execute: () => Promise.reject(new Error('not used in this flow')) },
        },
        {
            provide: OpenFileForProcessingUseCase,
            useValue: { execute: () => Promise.reject(new Error('not used in this flow')) },
        },
        {
            provide: HoldFileUseCase,
            useValue: { execute: () => Promise.reject(new Error('not used in this flow')) },
        },
        {
            provide: ReleaseFileHoldUseCase,
            useValue: { execute: () => Promise.reject(new Error('not used in this flow')) },
        },
        {
            provide: FindOwnedFilesUseCase,
            useValue: { execute: () => Promise.reject(new Error('not used in this flow')) },
        },
    ],
    exports: [
        GetFileUseCase,
        StoreGeneratedFileUseCase,
        OpenFileForProcessingUseCase,
        HoldFileUseCase,
        ReleaseFileHoldUseCase,
        FindOwnedFilesUseCase,
    ],
})
class NoFilesModule {}

interface TelegramUser {
    readonly id: string;
    readonly login: string;
    readonly telegramUserId: number;
}

interface StubSend {
    readonly chatId: string;
    readonly text: string;
    readonly at: number;
}

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function sentOk(): BotApiStubReply {
    return { status: 200, body: { ok: true, result: { message_id: randomInt(1, 1_000_000) } } };
}

function failure(status: number, description: string, retryAfter?: number): BotApiStubReply {
    return {
        status,
        body: {
            ok: false,
            error_code: status,
            description,
            ...(retryAfter === undefined ? {} : { parameters: { retry_after: retryAfter } }),
        },
    };
}

describe.skipIf(adminUrl === undefined)('telegram flow (modules wired end to end)', () => {
    const databaseName = `telegram_flow_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const updateIds: number[] = [];
    let app: INestApplication;
    let client: Client;
    let redis: Redis | null = null;
    let stub: BotApiStub;
    let base: string;
    let storageDir: string;
    let anna: TelegramUser;
    let sends: StubSend[] = [];
    let sendMessageReply: () => BotApiStubReply = sentOk;
    const sockets: ClientSocket[] = [];

    const bearer = (userId: string): Record<string, string> => ({
        authorization: `Bearer ${tokens.sign({ sub: userId, sid: 'session-1', mcp: false }).token}`,
    });

    async function addUser(prefix: string): Promise<TelegramUser> {
        const id = randomUUID();
        const login = `${prefix}_${id.slice(0, 6)}`;
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return { id, login, telegramUserId: randomInt(1_000_000, 2_000_000_000) };
    }

    async function sendToWebhook(user: TelegramUser, text: string): Promise<Response> {
        const updateId = randomInt(1, 2_000_000_000);
        updateIds.push(updateId);
        return fetch(`${base}/telegram/webhook`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', [SECRET_HEADER]: WEBHOOK_SECRET },
            body: JSON.stringify({
                update_id: updateId,
                message: {
                    message_id: randomInt(1, 1_000_000),
                    date: Math.floor(Date.now() / 1000),
                    chat: { id: user.telegramUserId, type: 'private' },
                    from: {
                        id: user.telegramUserId,
                        is_bot: false,
                        first_name: 'Tg',
                        username: `${user.login}_tg`,
                    },
                    text,
                },
            }),
        });
    }

    async function linkStatus(user: TelegramUser): Promise<z.infer<typeof linkStatusSchema>> {
        const response = await fetch(`${base}/telegram/link`, { headers: bearer(user.id) });
        expect(response.status).toBe(200);
        return linkStatusSchema.parse(await response.json());
    }

    async function linkTelegram(user: TelegramUser): Promise<void> {
        const issued = await fetch(`${base}/telegram/link-token`, {
            method: 'POST',
            headers: bearer(user.id),
        });
        expect(issued.status).toBe(201);
        const { url } = linkTokenSchema.parse(await issued.json());
        const token = new URL(url).searchParams.get('start');
        expect(token).not.toBeNull();
        const response = await sendToWebhook(user, `/start ${token ?? ''}`);
        expect(response.status).toBe(200);
    }

    function sendsTo(user: TelegramUser): StubSend[] {
        return sends.filter((send) => send.chatId === String(user.telegramUserId));
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

    async function waitForTelegramDelivery(taskId: string): Promise<string> {
        const deadline = Date.now() + RETRY_DEADLINE_MS;
        while (Date.now() < deadline) {
            const result = await client.query<{ status: string }>(
                `SELECT d.status FROM outbox_deliveries d
                 JOIN outbox_events e ON e.id = d.event_id
                 JOIN notifications n ON n.id::text = e.aggregate_id
                 WHERE n.target_id = $1 AND d.subscriber = $2`,
                [taskId, TELEGRAM_SUBSCRIBER],
            );
            const status = result.rows[0]?.status;
            if (status === 'done' || status === 'failed') return status;
            await pause(50);
        }
        throw new Error(`Telegram delivery of task ${taskId} did not finish`);
    }

    async function waitForTelegramSent(taskId: string): Promise<void> {
        const deadline = Date.now() + RETRY_DEADLINE_MS;
        while (Date.now() < deadline) {
            const result = await client.query<{ status: string }>(
                `SELECT t.status FROM telegram_deliveries t
                 JOIN notifications n ON n.id = t.notification_id
                 WHERE n.target_id = $1`,
                [taskId],
            );
            if (result.rows[0]?.status === 'sent') return;
            await pause(50);
        }
        throw new Error(`Telegram message for task ${taskId} was not recorded as sent`);
    }

    async function waitForSends(user: TelegramUser, count: number, ms: number): Promise<void> {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
            if (sendsTo(user).length >= count) return;
            await pause(25);
        }
        throw new Error(`Expected ${String(count)} sendMessage calls to the user chat`);
    }

    beforeAll(async () => {
        if (adminUrl === undefined) return;
        redis = await connectTestRedis();
        if (redis === null) return;
        registerAuthErrorStatuses();
        stub = await BotApiStub.start();
        stub.respond('sendMessage', (request) => {
            const body = sendMessageBodySchema.parse(request.body);
            sends.push({ chatId: body.chat_id, text: body.text, at: Date.now() });
            return sendMessageReply();
        });
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl, databaseName);
        storageDir = await mkdtemp(join(tmpdir(), 'telegram-flow-'));
        const redisOptions = testRedisOptions();
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
                            REDIS_HOST: redisOptions.host,
                            REDIS_PORT: redisOptions.port,
                            REDIS_PASSWORD: redisOptions.password,
                            REDIS_DB: 0,
                            TASKS_STORAGE_DIR: storageDir,
                            TASKS_MAX_FILE_SIZE_MB: 1,
                            TASKS_MAX_FILES_PER_TASK: 2,
                            OUTBOX_POLL_INTERVAL_MS: 100,
                            OUTBOX_BATCH_SIZE: 20,
                            OUTBOX_MAX_ATTEMPTS: 5,
                            OUTBOX_RETENTION_DAYS: 7,
                            AUTH_ALLOWED_ORIGINS: [],
                            NOTIFICATIONS_WS_PING_INTERVAL_MS: 20_000,
                            TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
                            TELEGRAM_BOT_USERNAME: TEST_BOT_USERNAME,
                            TELEGRAM_UPDATES_MODE: 'webhook',
                            TELEGRAM_WEBHOOK_URL: 'https://backend.example.test/telegram/webhook',
                            TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
                            TELEGRAM_LINK_TOKEN_TTL_SECONDS: 600,
                            TELEGRAM_DELIVERY_RESERVATION_MS: RESERVATION_MS,
                            TELEGRAM_API_BASE_URL: stub.baseUrl,
                            // The assistant/sheets-qa agent model is built at wiring time; no request is sent.
                            OPENROUTER_API_KEY: 'test-key',
                            CHAT_SYSTEM_MESSAGE_RETRY_MS: 200,
                            CHAT_SYSTEM_MESSAGE_DEADLINE_MS: 10_000,
                            MEETING_TRANSCRIPTION_ATTEMPTS: 3,
                            MEETING_TRANSCRIPTION_CONCURRENCY: 2,
                            MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS: 7_200_000,
                        }),
                    ],
                }),
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                QueueRootModule,
                OutboxModule,
                TasksModule,
                NotificationsModule,
                TelegramModule,
            ],
            providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
        })
            .overrideModule(AuthModule)
            .useModule(AuthStubModule)
            .overrideModule(FilesModule)
            .useModule(NoFilesModule)
            .overrideProvider(OutboxSettings)
            .useValue(
                new OutboxSettings({
                    pollIntervalMs: 100,
                    batchSize: 20,
                    maxAttempts: 5,
                    retentionDays: 7,
                    handlerTimeoutMs: HANDLER_TIMEOUT_MS,
                }),
            )
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
    }, 60_000);

    afterAll(async () => {
        if (redis === null) return;
        for (const socket of sockets) socket.disconnect();
        await app.close();
        await client.end();
        await stub.stop();
        await rm(storageDir, { recursive: true, force: true });
        await disconnectTestRedis(
            redis,
            updateIds.map((updateId) => `telegram:update:${String(updateId)}`),
        );
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach((ctx) => {
        if (redis === null) {
            ctx.skip();
            return;
        }
        sends = [];
        sendMessageReply = sentOk;
    });

    it('registers the webhook with the secret on startup', () => {
        expect(stub.requestsOf('setWebhook').map(({ body }) => body)).toEqual([
            {
                url: 'https://backend.example.test/telegram/webhook',
                secret_token: WEBHOOK_SECRET,
                allowed_updates: ['message'],
            },
        ]);
    });

    it('links the account through /start <token> and confirms it with the login', async () => {
        const boris = await addUser('boris');

        await linkTelegram(boris);

        expect(await linkStatus(boris)).toMatchObject({
            isAvailable: true,
            isLinked: true,
            username: `${boris.login}_tg`,
            notificationsEnabled: true,
        });
        expect(sendsTo(boris).map(({ text }) => text)).toEqual([BotReplies.linked(boris.login)]);
    });

    it('sends exactly one Telegram message for a task assignment while WebSocket still delivers', async () => {
        const boris = await addUser('boris');
        await linkTelegram(boris);
        sends = [];
        const socket = await connect(boris.id);

        const taskId = await createTask(anna.id, { title: 'Подготовить КП', assigneeId: boris.id });

        const delivered = notificationCreatedSchema.parse(
            await within(
                socket.nextEvent('notification.created'),
                DELIVERY_DEADLINE_MS,
                'notification.created over WebSocket',
            ),
        );
        expect(await waitForTelegramDelivery(taskId)).toBe('done');
        await pause(QUIET_PERIOD_MS);
        expect(sendsTo(boris).map(({ text }) => text)).toEqual([
            `<b>${delivered.notification.title}</b>\n${delivered.notification.body}`,
        ]);
        expect(delivered.notification.body).toBe(`От ${anna.login}: Подготовить КП`);
    });

    it('does not send notifications to Telegram after /mute', async () => {
        const boris = await addUser('boris');
        await linkTelegram(boris);
        expect((await sendToWebhook(boris, '/mute')).status).toBe(200);
        expect(await linkStatus(boris)).toMatchObject({ notificationsEnabled: false });
        sends = [];
        const socket = await connect(boris.id);

        const taskId = await createTask(anna.id, { title: 'Тихая задача', assigneeId: boris.id });

        await within(
            socket.nextEvent('notification.created'),
            DELIVERY_DEADLINE_MS,
            'notification.created over WebSocket',
        );
        expect(await waitForTelegramDelivery(taskId)).toBe('done');
        expect(sendsTo(boris)).toEqual([]);
    });

    it('removes the link when the bot is blocked by the user', async () => {
        const boris = await addUser('boris');
        await linkTelegram(boris);
        sendMessageReply = () => failure(403, 'Forbidden: bot was blocked by the user');

        const taskId = await createTask(anna.id, {
            title: 'Бот заблокирован',
            assigneeId: boris.id,
        });

        expect(await waitForTelegramDelivery(taskId)).toBe('done');
        expect(await linkStatus(boris)).toEqual({ isAvailable: true, isLinked: false });
        expect(sendsTo(boris)).toHaveLength(2);
    });

    it('retries a 429 not earlier than retry_after and sends one message', async () => {
        const boris = await addUser('boris');
        await linkTelegram(boris);
        sends = [];
        let isRateLimited = true;
        sendMessageReply = () => {
            if (!isRateLimited) return sentOk();
            isRateLimited = false;
            return failure(429, 'Too Many Requests: retry after 2', RETRY_AFTER_SECONDS);
        };

        const taskId = await createTask(anna.id, { title: 'Флуд-контроль', assigneeId: boris.id });

        await waitForSends(boris, 2, RETRY_DEADLINE_MS);
        expect(await waitForTelegramDelivery(taskId)).toBe('done');
        const attempts = sendsTo(boris).map(({ at }) => at);
        expect(attempts).toHaveLength(2);
        const [limitedAt = 0, retriedAt = 0] = attempts;
        expect(retriedAt - limitedAt).toBeGreaterThanOrEqual(RETRY_AFTER_SECONDS * 1000);
    }, 15_000);

    it('sends one message when the outbox retries a delivery whose send outlived the handler timeout', async () => {
        const boris = await addUser('boris');
        await linkTelegram(boris);
        sends = [];
        let isFirstSend = true;
        sendMessageReply = () => {
            if (!isFirstSend) return sentOk();
            isFirstSend = false;
            return { ...sentOk(), delayMs: SLOW_SEND_MS };
        };

        const taskId = await createTask(anna.id, {
            title: 'Медленный Telegram',
            assigneeId: boris.id,
        });

        await waitForTelegramSent(taskId);
        await pause(SLOW_SEND_MS);
        expect(sendsTo(boris)).toHaveLength(1);
        const retried = await client.query<{ status: string; attempts: number }>(
            `SELECT d.status, d.attempts FROM outbox_deliveries d
             JOIN outbox_events e ON e.id = d.event_id
             JOIN notifications n ON n.id::text = e.aggregate_id
             WHERE n.target_id = $1 AND d.subscriber = $2`,
            [taskId, TELEGRAM_SUBSCRIBER],
        );
        expect(retried.rows[0]?.attempts).toBeGreaterThanOrEqual(1);
    }, 15_000);

    it('delivers over WebSocket while Telegram is failing', async () => {
        const boris = await addUser('boris');
        await linkTelegram(boris);
        sends = [];
        sendMessageReply = () => failure(502, 'Bad Gateway');
        const socket = await connect(boris.id);

        await createTask(anna.id, { title: 'Telegram лежит', assigneeId: boris.id });

        const delivered = notificationCreatedSchema.parse(
            await within(
                socket.nextEvent('notification.created'),
                DELIVERY_DEADLINE_MS,
                'notification.created over WebSocket while Telegram fails',
            ),
        );
        expect(delivered.notification.body).toBe(`От ${anna.login}: Telegram лежит`);
        await waitForSends(boris, 1, DELIVERY_DEADLINE_MS);
        expect(await linkStatus(boris)).toMatchObject({ isLinked: true });
    });
});
