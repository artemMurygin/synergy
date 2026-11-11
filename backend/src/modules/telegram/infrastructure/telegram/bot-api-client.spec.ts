import { createServer } from 'node:net';
import { stdSerializers } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../../shared/outbox/domain/delivery-errors';
import {
    BotApiConflictError,
    BotApiRateLimitedError,
    BotApiRejectedError,
    ChatUnavailableError,
    TransientDeliveryError,
} from '../../application/errors';
import { BotApiStub } from '../../testing/bot-api-stub';
import { TEST_BOT_TOKEN, testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { BotApiClient, UnparsableEntitiesError } from './bot-api-client';

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

        it('sends a message as plain text without parse_mode when asked', async () => {
            stub.respond('sendMessage', { status: 200, body: sentMessage(43) });

            await expect(
                client.sendMessage(CHAT_ID, 'a < b', { plainText: true }),
            ).resolves.toEqual({ messageId: 43n });
            expect(stub.requestsOf('sendMessage')[0]?.body).toEqual({
                chat_id: CHAT_ID.toString(),
                text: 'a < b',
            });
        });

        it('gets the path and the size of a file by its id', async () => {
            stub.respond('getFile', {
                status: 200,
                body: {
                    ok: true,
                    result: {
                        file_id: 'voice-1',
                        file_unique_id: 'u1',
                        file_size: 52_340,
                        file_path: 'voice/file_7.oga',
                    },
                },
            });

            await expect(client.getFile('voice-1')).resolves.toEqual({
                filePath: 'voice/file_7.oga',
                fileSize: 52_340,
            });
            expect(stub.requestsOf('getFile')[0]?.body).toEqual({ file_id: 'voice-1' });
        });

        it('reports an unknown file size as null', async () => {
            stub.respond('getFile', {
                status: 200,
                body: {
                    ok: true,
                    result: { file_id: 'v', file_unique_id: 'u', file_path: 'voice/a.oga' },
                },
            });

            await expect(client.getFile('v')).resolves.toEqual({
                filePath: 'voice/a.oga',
                fileSize: null,
            });
        });

        it('rejects a file without a download path', async () => {
            stub.respond('getFile', {
                status: 200,
                body: { ok: true, result: { file_id: 'v', file_unique_id: 'u' } },
            });

            expect(await rejectionOf(client.getFile('v'))).toBeInstanceOf(BotApiRejectedError);
        });

        it('downloads a file from the Bot API file server', async () => {
            const audio = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
            stub.respondFile('voice/file_7.oga', { status: 200, body: audio });

            const downloaded = await client.downloadFile('voice/file_7.oga');

            expect(Buffer.compare(downloaded, audio)).toBe(0);
            expect(stub.fileRequests).toEqual([
                { token: TEST_BOT_TOKEN, filePath: 'voice/file_7.oga' },
            ]);
        });

        it('sends the typing chat action', async () => {
            await client.sendChatAction(CHAT_ID, 'typing');

            expect(stub.requestsOf('sendChatAction')[0]?.body).toEqual({
                chat_id: CHAT_ID.toString(),
                action: 'typing',
            });
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
        ])('rejects %s as a rejected request', async (_case, body) => {
            stub.respond('sendMessage', { status: 200, body });

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(BotApiRejectedError);
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

            expect(error).toBeInstanceOf(BotApiRateLimitedError);
            expect(error).toMatchObject({ retryAfterMs: 7_000 });
        });

        it('reports 429 without retry_after as rate limited without a pause', async () => {
            stub.respond('sendMessage', failure(429, 'Too Many Requests'));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(BotApiRateLimitedError);
            expect(error).toMatchObject({ retryAfterMs: null });
        });

        it.each([
            [403, 'Forbidden: bot was blocked by the user'],
            [403, 'Forbidden: user is deactivated'],
            [403, 'Forbidden: bot was kicked from the group chat'],
            [403, "Forbidden: bot can't initiate conversation with a user"],
            [403, 'Forbidden: bot is not a member of the channel chat'],
            [400, 'Bad Request: chat not found'],
        ])('reports status %i "%s" as an unavailable chat', async (status, description) => {
            stub.respond('sendMessage', failure(status, description));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(ChatUnavailableError);
        });

        it.each([
            [400, "Bad Request: can't parse entities: Unsupported start tag"],
            [400, 'Bad Request: message is too long'],
            [401, 'Unauthorized'],
            [404, 'Not Found'],
        ])('treats status %i "%s" as a rejected request', async (status, description) => {
            stub.respond('sendMessage', failure(status, description));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(BotApiRejectedError);
            expect(error).not.toBeInstanceOf(ChatUnavailableError);
            expect(error).not.toBeInstanceOf(BotApiConflictError);
        });

        it('reports 400 "can\'t parse entities" as unparsable entities, a rejected request', async () => {
            stub.respond(
                'sendMessage',
                failure(400, "Bad Request: can't parse entities: Unsupported start tag"),
            );

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(UnparsableEntitiesError);
            expect(error).toBeInstanceOf(BotApiRejectedError);
        });

        it.each([
            [400, 'Bad Request: message is too long'],
            [400, 'Bad Request: chat not found'],
            [401, 'Unauthorized'],
        ])('does not report status %i "%s" as unparsable entities', async (status, text) => {
            stub.respond('sendMessage', failure(status, text));

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).not.toBeInstanceOf(UnparsableEntitiesError);
        });

        it.each([
            [404, BotApiRejectedError],
            [500, TransientDeliveryError],
        ])('classifies a file download answered with %i', async (status, errorClass) => {
            stub.respondFile('voice/x.oga', { status, body: Buffer.from('nope') });

            const error = await rejectionOf(client.downloadFile('voice/x.oga'));

            expect(error).toBeInstanceOf(errorClass);
            expectNoTokenLeak(error);
        });

        it('treats a network failure of a file download as transient', async () => {
            const unreachable = new BotApiClient(
                testTelegramSettings({
                    apiBaseUrl: `http://127.0.0.1:${String(await closedPort())}`,
                }),
            );

            const error = await rejectionOf(unreachable.downloadFile('voice/x.oga'));

            expect(error).toBeInstanceOf(TransientDeliveryError);
            expectNoTokenLeak(error);
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
            expect(error).not.toBeInstanceOf(BotApiRejectedError);
        });

        it('fails permanently without a request when the bot token is missing', async () => {
            const unconfigured = new BotApiClient(
                testTelegramSettings({ apiBaseUrl: stub.baseUrl, botToken: undefined }),
            );

            const error = await rejectionOf(unconfigured.sendMessage(CHAT_ID, HTML));

            expect(error).toBeInstanceOf(BotApiRejectedError);
            expect(stub.requests).toHaveLength(0);
        });

        it.each([
            ['transient', failure(500, 'Internal Server Error')],
            ['rate limited', failure(429, 'Too Many Requests', { retry_after: 1 })],
            ['unavailable chat', failure(403, 'Forbidden: bot was blocked by the user')],
            ['rejected', failure(400, 'Bad Request: message is too long')],
            ['invalid response', { status: 200, body: { ok: true } }],
        ])('raises its own %s error, not an outbox error', async (_kind, reply) => {
            stub.respond('sendMessage', reply);

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            expect(error).not.toBeInstanceOf(PermanentDeliveryError);
            expect(error).not.toBeInstanceOf(RetryLaterDeliveryError);
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

        it('keeps the Telegram description out of the error and its log form', async () => {
            stub.respond(
                'sendMessage',
                failure(
                    400,
                    "Bad Request: can't parse entities: Проверить договор at byte offset 7",
                ),
            );

            const error = await rejectionOf(client.sendMessage(CHAT_ID, HTML));

            if (!(error instanceof Error)) throw new Error('Expected an Error');
            const logForm = JSON.stringify(stdSerializers.err(error));
            expect(logForm).not.toContain('Проверить договор');
            expect(logForm).not.toContain("can't parse");
            expect(JSON.stringify(error)).not.toContain('Проверить договор');
            expect(error).toMatchObject({
                metadata: { method: 'sendMessage', status: 400, reason: 'unparsable_entities' },
            });
        });
    });
});
