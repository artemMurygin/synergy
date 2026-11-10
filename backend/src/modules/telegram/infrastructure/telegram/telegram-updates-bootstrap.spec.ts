import { inspect } from 'node:util';
import { Counter } from '@prometheus-io/client';
import { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    type MockInstance,
    vi,
} from 'vitest';
import { silentLogger } from '../../application/test-doubles';
import { testBotUpdateDispatcher } from '../../testing/bot-update-dispatcher.fixture';
import { BotApiStub } from '../../testing/bot-api-stub';
import { TEST_BOT_TOKEN, testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { PollerLock } from '../cache/poller-lock';
import type { TelegramSettingsValues } from '../config/telegram-settings';
import { BotApiClient } from './bot-api-client';
import { TelegramUpdatesBootstrap } from './telegram-updates-bootstrap';
import { TELEGRAM_UPDATES_METRIC, TelegramUpdateMetrics } from './telegram-update-metrics';
import { TelegramUpdatesPoller } from './telegram-updates-poller';

const WEBHOOK_URL = 'https://synergy.example/telegram/webhook';
const WEBHOOK_SECRET = 'w'.repeat(40);

function unregisteredCounter(): Counter<'result'> {
    return new Counter({
        name: TELEGRAM_UPDATES_METRIC,
        help: 'test',
        labelNames: ['result'],
        registers: [],
    });
}

describe('TelegramUpdatesBootstrap', () => {
    let stub: BotApiStub;

    beforeAll(async () => {
        stub = await BotApiStub.start();
    });

    afterAll(async () => {
        await stub.stop();
    });

    afterEach(() => {
        stub.reset();
        vi.restoreAllMocks();
    });

    function bootstrapFor(overrides: Partial<TelegramSettingsValues>): {
        bootstrap: TelegramUpdatesBootstrap;
        start: MockInstance<TelegramUpdatesPoller['start']>;
        error: MockInstance<PinoLogger['error']>;
        warn: MockInstance<PinoLogger['warn']>;
    } {
        const settings = testTelegramSettings({ apiBaseUrl: stub.baseUrl, ...overrides });
        const client = new BotApiClient(settings);
        const poller = new TelegramUpdatesPoller(
            new PollerLock(new Redis({ lazyConnect: true })),
            client,
            testBotUpdateDispatcher(),
            new TelegramUpdateMetrics(unregisteredCounter()),
            silentLogger(),
        );
        const start = vi.spyOn(poller, 'start').mockImplementation(() => undefined);
        const logger = silentLogger();
        const error = vi.spyOn(logger, 'error');
        const warn = vi.spyOn(logger, 'warn');
        const bootstrap = new TelegramUpdatesBootstrap(settings, client, poller, logger);
        return { bootstrap, start, error, warn };
    }

    it('registers the webhook with the secret and only message updates in webhook mode', async () => {
        const { bootstrap, start } = bootstrapFor({
            updatesMode: 'webhook',
            webhookUrl: WEBHOOK_URL,
            webhookSecret: WEBHOOK_SECRET,
        });

        await bootstrap.onApplicationBootstrap();

        expect(stub.requests).toEqual([
            {
                token: TEST_BOT_TOKEN,
                method: 'setWebhook',
                body: {
                    url: WEBHOOK_URL,
                    secret_token: WEBHOOK_SECRET,
                    allowed_updates: ['message'],
                },
            },
        ]);
        expect(start).not.toHaveBeenCalled();
    });

    it('removes the webhook and starts the poller in polling mode', async () => {
        const { bootstrap, start, warn } = bootstrapFor({ updatesMode: 'polling' });

        await bootstrap.onApplicationBootstrap();

        expect(stub.requests.map((request) => request.method)).toEqual(['deleteWebhook']);
        expect(start).toHaveBeenCalledOnce();
        expect(warn).not.toHaveBeenCalled();
    });

    it('does nothing in off mode', async () => {
        const { bootstrap, start } = bootstrapFor({ updatesMode: 'off' });

        await bootstrap.onApplicationBootstrap();

        expect(stub.requests).toEqual([]);
        expect(start).not.toHaveBeenCalled();
    });

    it('does nothing when the bot token is missing', async () => {
        const { bootstrap, start } = bootstrapFor({ updatesMode: 'polling', botToken: undefined });

        await bootstrap.onApplicationBootstrap();

        expect(stub.requests).toEqual([]);
        expect(start).not.toHaveBeenCalled();
    });

    it('logs a failed webhook registration without the token and lets the app start', async () => {
        stub.respond('setWebhook', {
            status: 400,
            body: { ok: false, error_code: 400, description: 'Bad Request: bad webhook' },
        });
        const { bootstrap, error } = bootstrapFor({
            updatesMode: 'webhook',
            webhookUrl: WEBHOOK_URL,
            webhookSecret: WEBHOOK_SECRET,
        });

        await expect(bootstrap.onApplicationBootstrap()).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'setWebhook' }),
            'Telegram updates setup failed',
        );
        expect(inspect(error.mock.calls, { depth: 3 })).toContain('setWebhook responded with 400');
        expect(JSON.stringify(error.mock.calls)).not.toContain(TEST_BOT_TOKEN);
        expect(JSON.stringify(error.mock.calls)).not.toContain(WEBHOOK_SECRET);
    });

    it('still starts the poller when removing the webhook fails', async () => {
        stub.respond('deleteWebhook', {
            status: 502,
            body: { ok: false, description: 'Bad Gateway' },
        });
        const { bootstrap, start, error, warn } = bootstrapFor({ updatesMode: 'polling' });

        await bootstrap.onApplicationBootstrap();

        expect(start).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(
            { mode: 'polling' },
            'Telegram webhook may still be set, polling can hit conflicts until it is removed',
        );
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'deleteWebhook' }),
            'Telegram updates setup failed',
        );
        expect(inspect(error.mock.calls, { depth: 3 })).toContain('TransientDeliveryError');
    });
});
