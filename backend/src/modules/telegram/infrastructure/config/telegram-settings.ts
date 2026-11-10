import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../shared/config/env.schema';
import { ArgumentNotProvidedError, ArgumentOutOfRangeError } from '../../../../shared/errors';
import type { OutboxSettings } from '../../../../shared/outbox/infrastructure/outbox-settings';
import { normalizeBotUsername } from '../../domain/bot-username';
import {
    TelegramSettingsPort,
    type TelegramUpdatesMode,
    type TelegramWebhookSettings,
} from '../../application/ports/telegram-settings.port';

const REDACTED = '[redacted]';

export interface TelegramSettingsValues {
    readonly botToken: string | undefined;
    readonly botUsername: string | undefined;
    readonly updatesMode: TelegramUpdatesMode;
    readonly webhookUrl: string | undefined;
    readonly webhookSecret: string | undefined;
    readonly linkTokenTtlSeconds: number;
    readonly deliveryReservationMs: number;
    readonly apiBaseUrl: string;
    readonly outboxHandlerTimeoutMs: number;
}

export class TelegramSettings extends TelegramSettingsPort {
    readonly botUsername: string | null;
    readonly updatesMode: TelegramUpdatesMode;
    readonly webhook: TelegramWebhookSettings | null;
    readonly linkTokenTtlSeconds: number;
    readonly deliveryReservationMs: number;
    readonly apiBaseUrl: string;
    readonly #botToken: string | null;

    constructor(values: TelegramSettingsValues) {
        super();
        if (values.deliveryReservationMs <= values.outboxHandlerTimeoutMs) {
            throw new ArgumentOutOfRangeError(
                'Telegram delivery reservation must be longer than the outbox handler timeout',
                undefined,
                {
                    deliveryReservationMs: values.deliveryReservationMs,
                    handlerTimeoutMs: values.outboxHandlerTimeoutMs,
                },
            );
        }
        this.#botToken = values.botToken ?? null;
        this.botUsername = configuredBotUsername(values.botUsername);
        this.updatesMode = values.updatesMode;
        this.webhook = resolveWebhook(values);
        this.linkTokenTtlSeconds = values.linkTokenTtlSeconds;
        this.deliveryReservationMs = values.deliveryReservationMs;
        this.apiBaseUrl = values.apiBaseUrl.replace(/\/+$/, '');
    }

    get botToken(): string | null {
        return this.#botToken;
    }

    isConfigured(): boolean {
        return this.#botToken !== null && this.botUsername !== null && this.updatesMode !== 'off';
    }

    toJSON(): Record<string, unknown> {
        return {
            botToken: this.#botToken === null ? null : REDACTED,
            botUsername: this.botUsername,
            updatesMode: this.updatesMode,
            webhook: this.webhook === null ? null : { url: this.webhook.url, secret: REDACTED },
            linkTokenTtlSeconds: this.linkTokenTtlSeconds,
            deliveryReservationMs: this.deliveryReservationMs,
            apiBaseUrl: this.apiBaseUrl,
        };
    }

    static fromConfig(config: ConfigService<Env, true>, outbox: OutboxSettings): TelegramSettings {
        return new TelegramSettings({
            botToken: config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
            botUsername: config.get('TELEGRAM_BOT_USERNAME', { infer: true }),
            updatesMode: config.get('TELEGRAM_UPDATES_MODE', { infer: true }),
            webhookUrl: config.get('TELEGRAM_WEBHOOK_URL', { infer: true }),
            webhookSecret: config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }),
            linkTokenTtlSeconds: config.get('TELEGRAM_LINK_TOKEN_TTL_SECONDS', { infer: true }),
            deliveryReservationMs: config.get('TELEGRAM_DELIVERY_RESERVATION_MS', { infer: true }),
            apiBaseUrl: config.get('TELEGRAM_API_BASE_URL', { infer: true }),
            outboxHandlerTimeoutMs: outbox.handlerTimeoutMs,
        });
    }
}

function configuredBotUsername(botUsername: string | undefined): string | null {
    if (botUsername === undefined) return null;
    const normalized = normalizeBotUsername(botUsername);
    return normalized === '' ? null : normalized;
}

function resolveWebhook(values: TelegramSettingsValues): TelegramWebhookSettings | null {
    if (values.updatesMode !== 'webhook') return null;
    if (values.webhookUrl === undefined || values.webhookSecret === undefined) {
        throw new ArgumentNotProvidedError(
            'Telegram webhook url and secret are required in webhook mode',
        );
    }
    return { url: values.webhookUrl, secret: values.webhookSecret };
}
