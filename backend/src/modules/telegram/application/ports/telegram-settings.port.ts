export const TELEGRAM_UPDATES_MODES = ['webhook', 'polling', 'off'] as const;

export type TelegramUpdatesMode = (typeof TELEGRAM_UPDATES_MODES)[number];

export interface TelegramWebhookSettings {
    readonly url: string;
    readonly secret: string;
}

export abstract class TelegramSettingsPort {
    abstract readonly botToken: string | null;
    abstract readonly botUsername: string | null;
    abstract readonly updatesMode: TelegramUpdatesMode;
    abstract readonly webhook: TelegramWebhookSettings | null;
    abstract readonly linkTokenTtlSeconds: number;
    abstract readonly deliveryReservationMs: number;
    abstract readonly apiBaseUrl: string;
    abstract readonly portalUrl: string | null;

    abstract isConfigured(): boolean;
}
