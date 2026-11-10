import { createHash, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../database/postgres/migrator';
import { TransactionRunner } from '../../database/postgres/transaction-runner';
import { TransactionRunnerPort } from '../../database/postgres/transaction-runner.port';
import { connectTestRedis, disconnectTestRedis } from '../../shared/testing/test-redis';
import { GetTelegramLinkStatusUseCase } from './application/get-telegram-link-status.use-case';
import { IssueLinkTokenUseCase } from './application/issue-link-token.use-case';
import { LinkTokenThrottler } from './application/link-token-throttler';
import { BotMessengerPort } from './application/ports/bot-messenger.port';
import { RequestRateCounterPort } from './application/ports/request-rate-counter.port';
import { TelegramSettingsPort } from './application/ports/telegram-settings.port';
import { SetTelegramNotificationsUseCase } from './application/set-telegram-notifications.use-case';
import { UnlinkAccountUseCase } from './application/unlink-account.use-case';
import { ClockPort } from './domain/ports/clock.port';
import { LinkTokenStorePort } from './domain/ports/link-token-store.port';
import { TelegramLinkRepositoryPort } from './domain/ports/telegram-link-repository.port';
import { LinkTokenStore } from './infrastructure/cache/link-token-store';
import { RequestRateCounter } from './infrastructure/cache/request-rate-counter';
import type { TelegramSettings } from './infrastructure/config/telegram-settings';
import { TelegramLinkRepository } from './infrastructure/persistence/telegram-link.repository';
import { BotApiClient } from './infrastructure/telegram/bot-api-client';
import { RecordingMessageMetrics } from './application/test-doubles';
import { BotMessenger } from './infrastructure/telegram/bot-messenger';
import { Clock } from './infrastructure/time/clock';
import { LinkTokenThrottlerGuard } from './interface/http/link-token-throttler.guard';
import { TelegramLinkController } from './interface/http/telegram-link.controller';
import {
    startTelegramHttpFixture,
    type TelegramHttpFixture,
} from './interface/http/testing/telegram-http-fixture';
import { BotApiStub } from './testing/bot-api-stub';
import { TEST_BOT_USERNAME, testTelegramSettings } from './testing/telegram-settings.fixture';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const LINK_TOKEN_TTL_MS = 600_000;
const RATE_LIMIT = 10;
const CHAT_ID = 777_000_111;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('telegram link REST API (real storage)', () => {
    const databaseName = `telegram_api_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let redis: Redis | null = null;
    let stub: BotApiStub;
    let configured: TelegramHttpFixture;
    let unconfigured: TelegramHttpFixture;
    let anna: string;
    let boris: string;

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    async function linkTelegram(userId: string): Promise<void> {
        await client.query(
            `INSERT INTO telegram_links (user_id, telegram_user_id, chat_id, username,
                notifications_enabled, linked_at, updated_at)
             VALUES ($1, $2, $2, 'anna_tg', true, now(), now())`,
            [userId, CHAT_ID],
        );
    }

    async function startFixture(
        settings: TelegramSettings,
        connection: Redis,
        transactions: TransactionRunner,
    ): Promise<TelegramHttpFixture> {
        return startTelegramHttpFixture({
            controllers: [TelegramLinkController],
            providers: [
                GetTelegramLinkStatusUseCase,
                IssueLinkTokenUseCase,
                SetTelegramNotificationsUseCase,
                UnlinkAccountUseCase,
                LinkTokenThrottler,
                LinkTokenThrottlerGuard,
                { provide: TelegramSettingsPort, useValue: settings },
                { provide: TransactionRunnerPort, useValue: transactions },
                {
                    provide: TelegramLinkRepositoryPort,
                    useValue: new TelegramLinkRepository(transactions),
                },
                { provide: LinkTokenStorePort, useValue: new LinkTokenStore(connection) },
                { provide: RequestRateCounterPort, useValue: new RequestRateCounter(connection) },
                {
                    provide: BotMessengerPort,
                    useValue: new BotMessenger(
                        new BotApiClient(settings),
                        new RecordingMessageMetrics(),
                    ),
                },
                { provide: ClockPort, useClass: Clock },
            ],
        });
    }

    beforeAll(async () => {
        redis = await connectTestRedis();
        if (redis === null) return;
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl ?? '', databaseName);
        await migrate(databaseUrl);
        client = new Client({ connectionString: databaseUrl });
        await client.connect();
        pool = await createPool(databaseUrl);
        const transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        stub = await BotApiStub.start();
        configured = await startFixture(
            testTelegramSettings({ apiBaseUrl: stub.baseUrl }),
            redis,
            transactions,
        );
        unconfigured = await startFixture(
            testTelegramSettings({ apiBaseUrl: stub.baseUrl, botToken: undefined }),
            redis,
            transactions,
        );
    }, 60_000);

    afterAll(async () => {
        if (redis === null) return;
        await configured.app.close();
        await unconfigured.app.close();
        await stub.stop();
        await pool.end();
        await client.end();
        await disconnectTestRedis(redis, [
            `telegram:link-token-rate:${anna}`,
            `telegram:link-token-rate:${boris}`,
        ]);
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async (ctx) => {
        if (redis === null) {
            ctx.skip();
            return;
        }
        await client.query('DELETE FROM telegram_links');
        await client.query('DELETE FROM auth_users');
        anna = await addUser('anna');
        boris = await addUser('boris');
        stub.reset();
        stub.respond('sendMessage', {
            status: 200,
            body: { ok: true, result: { message_id: 1, chat: { id: CHAT_ID }, date: 1 } },
        });
    });

    it('GET /telegram/link reports an unlinked user with the bot available', async () => {
        const response = await configured.call('GET', '/telegram/link', {
            headers: configured.bearer(anna),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ isAvailable: true, isLinked: false });
    });

    it('GET /telegram/link returns the link fields of the token user only', async () => {
        await linkTelegram(anna);

        const annaStatus = await configured.call('GET', '/telegram/link', {
            headers: configured.bearer(anna),
        });
        const borisStatus = await configured.call('GET', '/telegram/link', {
            headers: configured.bearer(boris),
        });

        const annaBody: unknown = await annaStatus.json();
        expect(annaBody).toMatchObject({
            isAvailable: true,
            isLinked: true,
            username: 'anna_tg',
            notificationsEnabled: true,
        });
        expect(JSON.stringify(annaBody)).toMatch(/"linkedAt":"\d{4}-\d{2}-\d{2}T[^"]+Z"/);
        expect(await borisStatus.json()).toEqual({ isAvailable: true, isLinked: false });
    });

    it('POST /telegram/link-token answers 201 and stores only the token hash in Redis', async () => {
        const startedAt = Date.now();

        const response = await configured.call('POST', '/telegram/link-token', {
            headers: configured.bearer(anna),
        });

        expect(response.status).toBe(201);
        const body: unknown = await response.json();
        const { url, expiresAt } = issuedLinkOf(body);
        expect(body).toEqual({ url, expiresAt });
        expect(url).toMatch(
            new RegExp(`^https://t\\.me/${TEST_BOT_USERNAME}\\?start=[A-Za-z0-9_-]{32}$`),
        );
        expect(new Date(expiresAt).getTime() - startedAt).toBeGreaterThan(
            LINK_TOKEN_TTL_MS - 5_000,
        );
        const token = new URL(url).searchParams.get('start') ?? '';
        const digest = createHash('sha256').update(token).digest('hex');
        expect(await redis?.get(`telegram:link-token:${digest}`)).toBe(anna);
        expect(await redis?.exists(`telegram:link-token:${token}`)).toBe(0);
    });

    it('POST /telegram/link-token answers 503 TELEGRAM_NOT_CONFIGURED without a bot', async () => {
        const response = await unconfigured.call('POST', '/telegram/link-token', {
            headers: unconfigured.bearer(boris),
        });

        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: 'TELEGRAM_NOT_CONFIGURED' });
    });

    it('POST /telegram/link-token answers 429 after 10 requests a minute, per user', async () => {
        await redis?.del(`telegram:link-token-rate:${anna}`);
        for (let attempt = 0; attempt < RATE_LIMIT; attempt += 1) {
            const allowed = await configured.call('POST', '/telegram/link-token', {
                headers: configured.bearer(anna),
            });
            expect(allowed.status).toBe(201);
        }

        const limited = await configured.call('POST', '/telegram/link-token', {
            headers: configured.bearer(anna),
        });
        const otherUser = await configured.call('POST', '/telegram/link-token', {
            headers: configured.bearer(boris),
        });

        expect(limited.status).toBe(429);
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(await limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
        expect(otherUser.status).toBe(201);
    });

    it('PATCH /telegram/link switches notifications and answers 200', async () => {
        await linkTelegram(anna);

        const response = await configured.call('PATCH', '/telegram/link', {
            headers: configured.bearer(anna),
            body: { notificationsEnabled: false },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            isLinked: true,
            notificationsEnabled: false,
        });
        const stored = await client.query<{ notifications_enabled: boolean }>(
            'SELECT notifications_enabled FROM telegram_links WHERE user_id = $1',
            [anna],
        );
        expect(stored.rows[0]?.notifications_enabled).toBe(false);
    });

    it('PATCH /telegram/link answers 404 TELEGRAM_NOT_LINKED without a link', async () => {
        const response = await configured.call('PATCH', '/telegram/link', {
            headers: configured.bearer(boris),
            body: { notificationsEnabled: true },
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: 'TELEGRAM_NOT_LINKED' });
    });

    it('PATCH /telegram/link answers 400 for an invalid body', async () => {
        await linkTelegram(anna);

        const response = await configured.call('PATCH', '/telegram/link', {
            headers: configured.bearer(anna),
            body: { notificationsEnabled: 'off' },
        });

        expect(response.status).toBe(400);
    });

    it('DELETE /telegram/link answers 204, tells the old chat, and answers 204 again', async () => {
        await linkTelegram(anna);

        const first = await configured.call('DELETE', '/telegram/link', {
            headers: configured.bearer(anna),
        });
        const second = await configured.call('DELETE', '/telegram/link', {
            headers: configured.bearer(anna),
        });

        expect(first.status).toBe(204);
        expect(second.status).toBe(204);
        const remaining = await client.query('SELECT 1 FROM telegram_links WHERE user_id = $1', [
            anna,
        ]);
        expect(remaining.rowCount).toBe(0);
        expect(stub.requestsOf('sendMessage')).toHaveLength(1);
        expect(stub.requestsOf('sendMessage')[0]?.body).toMatchObject({
            chat_id: String(CHAT_ID),
        });
    });

    it.each([
        ['GET', '/telegram/link'],
        ['POST', '/telegram/link-token'],
        ['PATCH', '/telegram/link'],
        ['DELETE', '/telegram/link'],
    ])('answers 401 to %s %s without an access token', async (method, path) => {
        const response = await configured.call(method, path, {
            ...(method === 'PATCH' ? { body: { notificationsEnabled: true } } : {}),
        });

        expect(response.status).toBe(401);
    });
});

function issuedLinkOf(body: unknown): { url: string; expiresAt: string } {
    if (
        typeof body === 'object' &&
        body !== null &&
        'url' in body &&
        typeof body.url === 'string' &&
        'expiresAt' in body &&
        typeof body.expiresAt === 'string'
    ) {
        return { url: body.url, expiresAt: body.expiresAt };
    }
    throw new Error('Unexpected link token response');
}
