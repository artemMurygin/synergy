import { createServer } from 'node:net';
import { stdSerializers } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../../shared/outbox/domain/delivery-errors';
import { ChatUnavailableError, TransientDeliveryError } from '../../application/errors';
import { BotApiStub } from '../../testing/bot-api-stub';
import { TEST_BOT_TOKEN, testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { BotApiClient, BotApiConflictError } from './bot-api-client';

const CHAT_ID = 9_007_199_254_740_993n;
const HTML = '<b>Новая задача</b>\nПроверить договор';
const SEND_MESSAGE_TIMEOUT_MS = 10_000;

function sentMessage(messageId: number): unknown {
    return { ok: true, result: { message_id: messageId, chat: { id: 1 }, date: 1 } };
}

function failure(
    status: number,
    description: string,
    parameters?: unknown,
): {
    status: number;
    body: unknown;
} {
    return { status, body: { ok: false, error_code: status, description, parameters } };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error: unknown) {
        return error;
    }
    throw new Error('Expected the promise to reject');
}

async function closedPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    await new Promise<void>((resolve) =>
        server.close(() => {
            resolve();
        }),
    );
    if (address === null || typeof address === 'string') throw new Error('No port');
    return address.port;
}

function expectNoTokenLeak(error: unknown): void {
    if (!(error instanceof Error)) throw new Error('Expected an Error');
    expect(error.message).not.toContain(TEST_BOT_TOKEN);
    expect(String(error.stack)).not.toContain(TEST_BOT_TOKEN);
    expect(JSON.stringify(error)).not.toContain(TEST_BOT_TOKEN);
    expect(JSON.stringify(stdSerializers.err(error))).not.toContain(TEST_BOT_TOKEN);
}

describe('BotApiClient', () => {
    let stub: BotApiStub;
    let client: BotApiClient;

    beforeAll(async () => {
        stub = await BotApiStub.start();
        client = new BotApiClient(testTelegramSettings({ apiBaseUrl: stub.baseUrl }));
    });

    afterEach(() => {
        stub.reset();
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        await stub.stop();
    });

    describe('methods', () => {
        it('sends an HTML message to the chat at the configured Bot API address', async () => {
            stub.respond('sendMessage', { status: 200, body: sentMessage(42) });

            const sent = await client.sendMessage(CHAT_ID, HTML);

            expect(sent).toEqual({ messageId: 42n });
            expect(stub.requests).toEqual([
                {
                    token: TEST_BOT_TOKEN,
                    method: 'sendMessage',
                    body: { chat_id: CHAT_ID.toString(), text: HTML, parse_mode: 'HTML' },
                },
            ]);
        });

        it('takes the address from TELEGRAM_API_BASE_URL even with a trailing slash', async () => {
            const slashed = new BotApiClient(
                testTelegramSettings({ apiBaseUrl: `${stub.baseUrl}/` }),
            );
            stub.respond('sendMessage', { status: 200, body: sentMessage(7) });

            await expect(slashed.sendMessage(CHAT_ID, HTML)).resolves.toEqual({ messageId: 7n });
            expect(stub.requestsOf('sendMessage')).toHaveLength(1);
        });

        it('sets the webhook with the secret and the allowed updates', async () => {
            await client.setWebhook({
                url: 'https://example.test/telegram/webhook',
                secretToken: 's'.repeat(32),
                allowedUpdates: ['message'],
            });

            expect(stub.requests).toEqual([
                {
                    token: TEST_BOT_TOKEN,
                    method: 'setWebhook',
                    body: {
                        url: 'https://example.test/telegram/webhook',
                        secret_token: 's'.repeat(32),
                        allowed_updates: ['message'],
                    },
                },
            ]);
        });

        it('deletes the webhook', async () => {
            await client.deleteWebhook();

            expect(stub.requestsOf('deleteWebhook')).toHaveLength(1);
        });

        it('gets updates from the offset with long polling and returns them raw', async () => {
            const updates = [{ update_id: 10, message: { text: '/help' } }, { update_id: 11 }];
            stub.respond('getUpdates', { status: 200, body: { ok: true, result: updates } });

            const received = await client.getUpdates({
                offset: 10,
                timeoutSeconds: 25,
                allowedUpdates: ['message'],
            });

            expect(received).toEqual(updates);
            expect(stub.requestsOf('getUpdates')[0]?.body).toEqual({
                offset: 10,
                timeout: 25,
                allowed_updates: ['message'],
            });
        });
    });

    describe('response validation', () => {
        it.each([
            ['a result of the wrong shape', { ok: true, result: { message_id: 'x' } }],
            ['no result', { ok: true }],
            ['ok false with status 200', { ok: false, description: 'odd' }],
            ['not an envelope', [1, 2, 3]],
        ])('rejects %s as a permanent error', async (_case, body) => {
            stub.respond('sendMessage', { status: 200, body });

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(PermanentDeliveryError);
        });
    });

    describe('timeouts', () => {
        it('limits sendMessage to 10 seconds', async () => {
            const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
            stub.respond('sendMessage', { status: 200, body: sentMessage(1) });

            await client.sendMessage(CHAT_ID, HTML);

            expect(timeoutSpy).toHaveBeenCalledWith(SEND_MESSAGE_TIMEOUT_MS);
        });

        it('waits longer than the long polling timeout for getUpdates', async () => {
            const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
            stub.respond('getUpdates', { status: 200, body: { ok: true, result: [] } });

            await client.getUpdates({ offset: 0, timeoutSeconds: 25, allowedUpdates: ['message'] });

            const [timeoutMs] = timeoutSpy.mock.calls[0] ?? [];
            expect(timeoutMs).toBeGreaterThan(25_000);
        });

        it('turns a request that outlives the timeout into a transient error', async () => {
            const impatient = new BotApiClient(testTelegramSettings({ apiBaseUrl: stub.baseUrl }), {
                requestTimeoutMs: 50,
            });
            stub.respond('sendMessage', { status: 200, body: sentMessage(1), delayMs: 1_000 });

            const error = await rejectionOf(impatient.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(TransientDeliveryError);
            expectNoTokenLeak(error);
        });

        it('stops getUpdates when the caller aborts', async () => {
            stub.respond('getUpdates', {
                status: 200,
                body: { ok: true, result: [] },
                delayMs: 5_000,
            });
            const controller = new AbortController();

            const pending = rejectionOf(
                client.getUpdates({
                    offset: 0,
                    timeoutSeconds: 25,
                    allowedUpdates: ['message'],
                    signal: controller.signal,
                }),
            );
            setTimeout(() => {
                controller.abort();
            }, 20);

            expect(await pending).toBeInstanceOf(TransientDeliveryError);
        });
    });

    describe('error classification', () => {
        it('treats a network failure as transient', async () => {
            const unreachable = new BotApiClient(
                testTelegramSettings({
                    apiBaseUrl: `http://127.0.0.1:${String(await closedPort())}`,
                }),
            );

            const error = await rejectionOf(unreachable.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(TransientDeliveryError);
            expectNoTokenLeak(error);
        });

        it.each([500, 502, 503, 504])('treats status %i as transient', async (status) => {
            stub.respond('sendMessage', failure(status, 'Internal Server Error'));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(TransientDeliveryError);
        });

        it('treats a 5xx response that is not json as transient', async () => {
            stub.respond('sendMessage', { status: 502, body: '<html>Bad Gateway</html>' });

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(TransientDeliveryError);
        });

        it('asks to retry after the pause Telegram gives on 429', async () => {
            stub.respond(
                'sendMessage',
                failure(429, 'Too Many Requests: retry after 7', { retry_after: 7 }),
            );

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(RetryLaterDeliveryError);
            expect(error).toMatchObject({ retryAfterMs: 7_000 });
        });

        it('treats 429 without retry_after as transient', async () => {
            stub.respond('sendMessage', failure(429, 'Too Many Requests'));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(TransientDeliveryError);
        });

        it.each([
            [403, 'Forbidden: bot was blocked by the user'],
            [403, 'Forbidden: user is deactivated'],
            [400, 'Bad Request: chat not found'],
        ])('reports status %i "%s" as an unavailable chat', async (status, description) => {
            stub.respond('sendMessage', failure(status, description));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(ChatUnavailableError);
            expect(error).not.toBeInstanceOf(PermanentDeliveryError);
        });

        it.each([
            [400, "Bad Request: can't parse entities: Unsupported start tag"],
            [400, 'Bad Request: message is too long'],
            [401, 'Unauthorized'],
            [403, 'Forbidden: bot is not a member of the channel chat'],
            [404, 'Not Found'],
        ])('treats status %i "%s" as permanent', async (status, description) => {
            stub.respond('sendMessage', failure(status, description));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(PermanentDeliveryError);
            expect(error).not.toBeInstanceOf(ChatUnavailableError);
            expect(error).not.toBeInstanceOf(BotApiConflictError);
        });

        it('reports 409 from getUpdates as a conflict', async () => {
            stub.respond(
                'getUpdates',
                failure(409, 'Conflict: terminated by other getUpdates request'),
            );

            const error = await rejectionOf(
                client.getUpdates({ offset: 0, timeoutSeconds: 0, allowedUpdates: ['message'] }),
            );

            expect(error).toBeInstanceOf(BotApiConflictError);
            expect(error).toBeInstanceOf(PermanentDeliveryError);
        });

        it('fails permanently without a request when the bot token is missing', async () => {
            const unconfigured = new BotApiClient(
                testTelegramSettings({ apiBaseUrl: stub.baseUrl, botToken: undefined }),
            );

            const error = await rejectionOf(unconfigured.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(PermanentDeliveryError);
            expect(stub.requests).toHaveLength(0);
        });
    });

    describe('bot token secrecy', () => {
        it.each([
            ['transient', failure(500, `upstream bot${TEST_BOT_TOKEN} failed`)],
            ['retry later', failure(429, `slow down ${TEST_BOT_TOKEN}`, { retry_after: 1 })],
            [
                'unavailable chat',
                failure(403, `Forbidden: bot was blocked by the user ${TEST_BOT_TOKEN}`),
            ],
            ['permanent', failure(401, `Unauthorized ${TEST_BOT_TOKEN}`)],
            ['invalid response', { status: 200, body: { ok: true, result: TEST_BOT_TOKEN } }],
        ])('keeps the token out of a %s error and its log form', async (_kind, reply) => {
            stub.respond('sendMessage', reply);

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expectNoTokenLeak(error);
        });

        it('keeps the token out of the message text sent with the error metadata', async () => {
            stub.respond('sendMessage', failure(400, 'Bad Request: message is too long'));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(JSON.stringify(error)).not.toContain('Проверить договор');
        });
    });
});
