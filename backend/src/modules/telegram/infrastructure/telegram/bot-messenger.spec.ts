import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    BotApiRateLimitedError,
    BotApiRejectedError,
    ChatUnavailableError,
} from '../../application/errors';
import { BotMessengerPort } from '../../application/ports/bot-messenger.port';
import { RecordingMessageMetrics } from '../../application/test-doubles';
import { BotApiStub } from '../../testing/bot-api-stub';
import { TEST_BOT_TOKEN, testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { BotApiClient } from './bot-api-client';
import { BotMessenger } from './bot-messenger';

const CHAT_ID = 777n;

describe('BotMessenger', () => {
    let stub: BotApiStub;
    let messenger: BotMessenger;
    let metrics: RecordingMessageMetrics;

    beforeAll(async () => {
        stub = await BotApiStub.start();
        metrics = new RecordingMessageMetrics();
        messenger = new BotMessenger(
            new BotApiClient(testTelegramSettings({ apiBaseUrl: stub.baseUrl })),
            metrics,
        );
    });

    afterEach(() => {
        stub.reset();
        metrics.sent.length = 0;
        metrics.errors.length = 0;
    });

    afterAll(async () => {
        await stub.stop();
    });

    it('implements the messenger port', () => {
        expect(messenger).toBeInstanceOf(BotMessengerPort);
    });

    it('sends the HTML to the chat and returns the message id', async () => {
        stub.respond('sendMessage', {
            status: 200,
            body: { ok: true, result: { message_id: 501 } },
        });

        await expect(messenger.send(CHAT_ID, '<b>Привет</b>')).resolves.toEqual({
            messageId: 501n,
        });
        expect(stub.requestsOf('sendMessage')[0]).toEqual({
            token: TEST_BOT_TOKEN,
            method: 'sendMessage',
            body: { chat_id: '777', text: '<b>Привет</b>', parse_mode: 'HTML' },
        });
        expect(metrics.sent).toEqual(['reply']);
    });

    it('passes the classified errors through', async () => {
        stub.respond('sendMessage', {
            status: 403,
            body: {
                ok: false,
                error_code: 403,
                description: 'Forbidden: bot was blocked by the user',
            },
        });
        await expect(messenger.send(CHAT_ID, 'x')).rejects.toBeInstanceOf(ChatUnavailableError);

        stub.respond('sendMessage', {
            status: 429,
            body: {
                ok: false,
                error_code: 429,
                description: 'Too Many',
                parameters: { retry_after: 3 },
            },
        });
        await expect(messenger.send(CHAT_ID, 'x')).rejects.toBeInstanceOf(BotApiRateLimitedError);
        expect(metrics.errors).toEqual(['chat_unavailable', 'rate_limited']);
        expect(metrics.sent).toEqual([]);
    });

    describe('formatting fallback', () => {
        const CANT_PARSE = {
            status: 400,
            body: {
                ok: false,
                error_code: 400,
                description: "Bad Request: can't parse entities: Unsupported start tag",
            },
        };

        it('resends the part without parse_mode and with unescaped text when Telegram cannot parse its entities', async () => {
            stub.respond('sendMessage', (request) =>
                isHtml(request.body)
                    ? CANT_PARSE
                    : { status: 200, body: { ok: true, result: { message_id: 502 } } },
            );

            await expect(messenger.send(CHAT_ID, 'a <b c &amp; d')).resolves.toEqual({
                messageId: 502n,
            });
            expect(stub.requestsOf('sendMessage').map(({ body }) => body)).toEqual([
                { chat_id: '777', text: 'a <b c &amp; d', parse_mode: 'HTML' },
                { chat_id: '777', text: 'a <b c & d' },
            ]);
            expect(metrics.sent).toEqual(['reply']);
            expect(metrics.errors).toEqual([]);
        });

        it('does not resend on another rejection', async () => {
            stub.respond('sendMessage', {
                status: 400,
                body: {
                    ok: false,
                    error_code: 400,
                    description: 'Bad Request: message is too long',
                },
            });

            await expect(messenger.send(CHAT_ID, 'x')).rejects.toBeInstanceOf(BotApiRejectedError);
            expect(stub.requestsOf('sendMessage')).toHaveLength(1);
            expect(metrics.errors).toEqual(['permanent']);
        });

        it('passes the error of the plain resend through', async () => {
            stub.respond('sendMessage', (request) =>
                isHtml(request.body)
                    ? CANT_PARSE
                    : {
                          status: 403,
                          body: { ok: false, error_code: 403, description: 'Forbidden: blocked' },
                      },
            );

            await expect(messenger.send(CHAT_ID, 'x')).rejects.toBeInstanceOf(ChatUnavailableError);
            expect(stub.requestsOf('sendMessage')).toHaveLength(2);
            expect(metrics.errors).toEqual(['chat_unavailable']);
        });
    });

    it('shows the typing indicator in the chat', async () => {
        await messenger.sendChatAction(CHAT_ID, 'typing');

        expect(stub.requestsOf('sendChatAction')[0]?.body).toEqual({
            chat_id: '777',
            action: 'typing',
        });
    });
});

function isHtml(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'parse_mode' in body;
}
