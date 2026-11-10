import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RetryLaterDeliveryError } from '../../../../shared/outbox/domain/delivery-errors';
import { ChatUnavailableError } from '../../application/errors';
import { BotMessengerPort } from '../../application/ports/bot-messenger.port';
import { BotApiStub } from '../../testing/bot-api-stub';
import { TEST_BOT_TOKEN, testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { BotApiClient } from './bot-api-client';
import { BotMessenger } from './bot-messenger';

const CHAT_ID = 777n;

describe('BotMessenger', () => {
    let stub: BotApiStub;
    let messenger: BotMessenger;

    beforeAll(async () => {
        stub = await BotApiStub.start();
        messenger = new BotMessenger(
            new BotApiClient(testTelegramSettings({ apiBaseUrl: stub.baseUrl })),
        );
    });

    afterEach(() => {
        stub.reset();
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
        await expect(messenger.send(CHAT_ID, 'x')).rejects.toBeInstanceOf(RetryLaterDeliveryError);
    });
});
