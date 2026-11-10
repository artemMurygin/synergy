import {
    TelegramSettings,
    type TelegramSettingsValues,
} from '../infrastructure/config/telegram-settings';

export const TEST_BOT_TOKEN = '123456:telegram-test-bot-token-secret';
export const TEST_BOT_USERNAME = 'synergy_test_bot';

const DEFAULT_VALUES: TelegramSettingsValues = {
    botToken: TEST_BOT_TOKEN,
    botUsername: TEST_BOT_USERNAME,
    updatesMode: 'polling',
    webhookUrl: undefined,
    webhookSecret: undefined,
    linkTokenTtlSeconds: 600,
    deliveryReservationMs: 120_000,
    apiBaseUrl: 'https://api.telegram.org',
    outboxHandlerTimeoutMs: 60_000,
};

export function testTelegramSettings(
    overrides: Partial<TelegramSettingsValues> = {},
): TelegramSettings {
    return new TelegramSettings({ ...DEFAULT_VALUES, ...overrides });
}
