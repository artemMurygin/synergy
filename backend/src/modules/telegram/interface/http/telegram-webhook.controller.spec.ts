import type * as Crypto from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotUpdateDispatcher } from '../../application/bot-update-dispatcher';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { TelegramUpdateMetricsPort } from '../../application/ports/telegram-update-metrics.port';
import { testBotUpdateDispatcher } from '../../testing/bot-update-dispatcher.fixture';
import { testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { isWebhookSecretMatching, TelegramWebhookController } from './telegram-webhook.controller';
import {
    startTelegramHttpFixture,
    type TelegramHttpFixture,
} from './testing/telegram-http-fixture';

vi.mock('node:crypto', async (importOriginal) => {
    const original = await importOriginal<typeof Crypto>();
    return { ...original, timingSafeEqual: vi.fn(original.timingSafeEqual) };
});

const WEBHOOK_SECRET = 'w'.repeat(40);
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const UPDATE = { update_id: 501, message: { text: '/help' } };

class RecordingUpdateMetrics extends TelegramUpdateMetricsPort {
    readonly results: string[] = [];

    recordUpdate(result: string): void {
        this.results.push(result);
    }
}

describe('TelegramWebhookController', () => {
    let fixture: TelegramHttpFixture;
    const dispatcher = testBotUpdateDispatcher();
    const metrics = new RecordingUpdateMetrics();
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const dispatch = vi.spyOn(dispatcher, 'dispatch');
    const warn = vi.spyOn(logger, 'warn');

    function post(headers: Record<string, string>, body: unknown = UPDATE): Promise<Response> {
        return fixture.call('POST', '/telegram/webhook', { headers, body });
    }

    beforeAll(async () => {
        fixture = await startTelegramHttpFixture({
            controllers: [TelegramWebhookController],
            providers: [
                { provide: BotUpdateDispatcher, useValue: dispatcher },
                { provide: TelegramUpdateMetricsPort, useValue: metrics },
                {
                    provide: TelegramSettingsPort,
                    useValue: testTelegramSettings({
                        updatesMode: 'webhook',
                        webhookUrl: 'https://synergy.example/telegram/webhook',
                        webhookSecret: WEBHOOK_SECRET,
                    }),
                },
            ],
            logger,
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        dispatch.mockReset();
        dispatch.mockResolvedValue('handled');
        warn.mockClear();
        vi.mocked(timingSafeEqual).mockClear();
        metrics.results.length = 0;
    });

    it('rejects a request without the secret header with 401 and does not dispatch', async () => {
        const response = await post({});

        expect(response.status).toBe(401);
        expect(dispatch).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith({}, 'Telegram webhook secret rejected');
    });

    it('rejects a wrong secret with 401, compared in constant time, and never logs it', async () => {
        const wrongSecret = 'x'.repeat(40);

        const response = await post({ [SECRET_HEADER]: wrongSecret });

        expect(response.status).toBe(401);
        expect(dispatch).not.toHaveBeenCalled();
        expect(timingSafeEqual).toHaveBeenCalled();
        expect(JSON.stringify(warn.mock.calls)).not.toContain(wrongSecret);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(WEBHOOK_SECRET);
    });

    it('rejects a secret of another length with 401 without throwing', async () => {
        const response = await post({ [SECRET_HEADER]: 'short' });

        expect(response.status).toBe(401);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('accepts the right secret without an access token, dispatches the update and answers 200', async () => {
        const response = await post({ [SECRET_HEADER]: WEBHOOK_SECRET });

        expect(response.status).toBe(200);
        expect(dispatch).toHaveBeenCalledExactlyOnceWith(UPDATE);
        expect(metrics.results).toEqual(['handled']);
    });

    it('still answers 200 when processing the update fails', async () => {
        dispatch.mockResolvedValue('failed');

        const response = await post({ [SECRET_HEADER]: WEBHOOK_SECRET });

        expect(response.status).toBe(200);
        expect(metrics.results).toEqual(['failed']);
    });
});

describe('isWebhookSecretMatching', () => {
    it('matches only the configured secret', () => {
        expect(isWebhookSecretMatching(WEBHOOK_SECRET, WEBHOOK_SECRET)).toBe(true);
        expect(isWebhookSecretMatching(WEBHOOK_SECRET, `${WEBHOOK_SECRET}x`)).toBe(false);
        expect(isWebhookSecretMatching(WEBHOOK_SECRET, '')).toBe(false);
        expect(isWebhookSecretMatching(WEBHOOK_SECRET, undefined)).toBe(false);
        expect(isWebhookSecretMatching(null, WEBHOOK_SECRET)).toBe(false);
    });
});

describe('TelegramWebhookController outside webhook mode', () => {
    let fixture: TelegramHttpFixture;
    const dispatcher = testBotUpdateDispatcher();
    const dispatch = vi.spyOn(dispatcher, 'dispatch');

    beforeAll(async () => {
        fixture = await startTelegramHttpFixture({
            controllers: [TelegramWebhookController],
            providers: [
                { provide: BotUpdateDispatcher, useValue: dispatcher },
                { provide: TelegramUpdateMetricsPort, useValue: new RecordingUpdateMetrics() },
                { provide: TelegramSettingsPort, useValue: testTelegramSettings() },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    it('rejects every request with 401 because no secret is configured', async () => {
        const response = await fixture.call('POST', '/telegram/webhook', {
            headers: { [SECRET_HEADER]: WEBHOOK_SECRET },
            body: UPDATE,
        });

        expect(response.status).toBe(401);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
