import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { validateEnv, type Env } from '../../../../shared/config/env.schema';
import { ArgumentNotProvidedError, ArgumentOutOfRangeError } from '../../../../shared/errors';
import { OutboxSettings } from '../../../../shared/outbox/infrastructure/outbox-settings';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { TelegramSettings, type TelegramSettingsValues } from './telegram-settings';

const BOT_TOKEN = '123456:telegram-bot-token-secret-value';
const HANDLER_TIMEOUT_MS = 60_000;

const REQUIRED_ENV = {
    POSTGRES_URL: 'postgresql://audit:audit@localhost:5432/audit_agent',
    MSSQL_URL: 'sqlserver://localhost:1433;database=master',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
};

const BASE_VALUES: TelegramSettingsValues = {
    botToken: BOT_TOKEN,
    botUsername: 'synergy_helper_bot',
    updatesMode: 'polling',
    webhookUrl: undefined,
    webhookSecret: undefined,
    linkTokenTtlSeconds: 600,
    deliveryReservationMs: 120_000,
    apiBaseUrl: 'https://api.telegram.org',
    portalUrl: undefined,
    outboxHandlerTimeoutMs: HANDLER_TIMEOUT_MS,
};

const outboxSettings = new OutboxSettings({
    pollIntervalMs: 1000,
    batchSize: 10,
    maxAttempts: 3,
    retentionDays: 7,
});

const configFrom = (raw: Record<string, unknown>): ConfigService<Env, true> =>
    new ConfigService<Env, true>(validateEnv({ ...REQUIRED_ENV, ...raw }));

const caught = (action: () => unknown): unknown => {
    try {
        action();
    } catch (error: unknown) {
        return error;
    }
    throw new Error('Expected the action to throw');
};

describe('TelegramSettings', () => {
    describe('portalUrl', () => {
        it('is null without PORTAL_PUBLIC_URL', () => {
            const settings = TelegramSettings.fromConfig(configFrom({}), outboxSettings);

            expect(settings.portalUrl).toBeNull();
        });

        it('is read from PORTAL_PUBLIC_URL without trailing slashes', () => {
            const settings = TelegramSettings.fromConfig(
                configFrom({ PORTAL_PUBLIC_URL: 'https://portal.example.com//' }),
                outboxSettings,
            );

            expect(settings.portalUrl).toBe('https://portal.example.com');
        });

        it('rejects a non-http url in the env', () => {
            expect(() => configFrom({ PORTAL_PUBLIC_URL: 'ftp://portal.example.com' })).toThrow();
        });
    });

    it('implements the settings port', () => {
        expect(new TelegramSettings(BASE_VALUES)).toBeInstanceOf(TelegramSettingsPort);
    });

    it('reads defaults from the validated env', () => {
        const settings = TelegramSettings.fromConfig(configFrom({}), outboxSettings);

        expect(settings.botToken).toBeNull();
        expect(settings.botUsername).toBeNull();
        expect(settings.updatesMode).toBe('off');
        expect(settings.webhook).toBeNull();
        expect(settings.linkTokenTtlSeconds).toBe(600);
        expect(settings.deliveryReservationMs).toBe(120_000);
        expect(settings.apiBaseUrl).toBe('https://api.telegram.org');
        expect(settings.isConfigured()).toBe(false);
    });

    it('reads a webhook configuration from the validated env', () => {
        const settings = TelegramSettings.fromConfig(
            configFrom({
                TELEGRAM_BOT_TOKEN: BOT_TOKEN,
                TELEGRAM_BOT_USERNAME: '@synergy_helper_bot',
                TELEGRAM_UPDATES_MODE: 'webhook',
                TELEGRAM_WEBHOOK_URL: 'https://api.example.com/telegram/webhook',
                TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32),
                TELEGRAM_LINK_TOKEN_TTL_SECONDS: '300',
                TELEGRAM_DELIVERY_RESERVATION_MS: '90000',
                TELEGRAM_API_BASE_URL: 'http://127.0.0.1:8081/',
            }),
            outboxSettings,
        );

        expect(settings.botToken).toBe(BOT_TOKEN);
        expect(settings.botUsername).toBe('synergy_helper_bot');
        expect(settings.updatesMode).toBe('webhook');
        expect(settings.webhook).toEqual({
            url: 'https://api.example.com/telegram/webhook',
            secret: 's'.repeat(32),
        });
        expect(settings.linkTokenTtlSeconds).toBe(300);
        expect(settings.deliveryReservationMs).toBe(90_000);
        expect(settings.apiBaseUrl).toBe('http://127.0.0.1:8081');
        expect(settings.isConfigured()).toBe(true);
    });

    it('ignores webhook values outside webhook mode', () => {
        const settings = new TelegramSettings({
            ...BASE_VALUES,
            webhookUrl: 'https://api.example.com/telegram/webhook',
            webhookSecret: 's'.repeat(32),
        });

        expect(settings.webhook).toBeNull();
    });

    it('requires webhook values in webhook mode', () => {
        expect(() => new TelegramSettings({ ...BASE_VALUES, updatesMode: 'webhook' })).toThrow(
            ArgumentNotProvidedError,
        );
    });

    it.each([HANDLER_TIMEOUT_MS, HANDLER_TIMEOUT_MS - 1])(
        'rejects a delivery reservation of %i ms that does not outlive the handler timeout',
        (deliveryReservationMs) => {
            expect(() => new TelegramSettings({ ...BASE_VALUES, deliveryReservationMs })).toThrow(
                ArgumentOutOfRangeError,
            );
        },
    );

    it('fails at startup when the env reservation does not outlive the outbox handler timeout', () => {
        expect(() =>
            TelegramSettings.fromConfig(
                configFrom({ TELEGRAM_DELIVERY_RESERVATION_MS: String(HANDLER_TIMEOUT_MS) }),
                outboxSettings,
            ),
        ).toThrow(ArgumentOutOfRangeError);
    });

    it('accepts a reservation longer than the handler timeout', () => {
        const settings = new TelegramSettings({
            ...BASE_VALUES,
            deliveryReservationMs: HANDLER_TIMEOUT_MS + 1,
        });

        expect(settings.deliveryReservationMs).toBe(HANDLER_TIMEOUT_MS + 1);
    });

    it('is configured with a token, a bot username and an active updates mode', () => {
        expect(new TelegramSettings(BASE_VALUES).isConfigured()).toBe(true);
    });

    it.each<[string, Partial<TelegramSettingsValues>]>([
        ['without a token', { botToken: undefined }],
        ['without a bot username', { botUsername: undefined }],
        ['in off mode', { updatesMode: 'off' }],
    ])('is not configured %s', (_case, override) => {
        expect(new TelegramSettings({ ...BASE_VALUES, ...override }).isConfigured()).toBe(false);
    });

    it('does not expose the bot token when serialized for logs', () => {
        const settings = new TelegramSettings(BASE_VALUES);

        expect(JSON.stringify(settings)).not.toContain(BOT_TOKEN);
        expect(JSON.stringify({ settings })).not.toContain(BOT_TOKEN);
    });

    it('does not put the bot token into startup errors', () => {
        const reservationError = caught(
            () => new TelegramSettings({ ...BASE_VALUES, deliveryReservationMs: 1 }),
        );
        const webhookError = caught(
            () => new TelegramSettings({ ...BASE_VALUES, updatesMode: 'webhook' }),
        );

        for (const error of [reservationError, webhookError]) {
            expect(error).toBeInstanceOf(Error);
            expect(JSON.stringify(error)).not.toContain(BOT_TOKEN);
            expect(error instanceof Error ? error.message : '').not.toContain(BOT_TOKEN);
        }
    });
});
