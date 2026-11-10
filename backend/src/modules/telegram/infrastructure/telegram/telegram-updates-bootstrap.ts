import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { BotApiClient, type BotMethod } from './bot-api-client';
import { TelegramUpdatesPoller } from './telegram-updates-poller';

@Injectable()
export class TelegramUpdatesBootstrap implements OnApplicationBootstrap {
    constructor(
        private readonly settings: TelegramSettingsPort,
        private readonly client: BotApiClient,
        private readonly poller: TelegramUpdatesPoller,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(TelegramUpdatesBootstrap.name);
    }

    async onApplicationBootstrap(): Promise<void> {
        const mode = this.settings.updatesMode;
        if (mode === 'off' || this.settings.botToken === null) {
            this.logger.info({ mode }, 'Telegram updates are not received');
            return;
        }
        if (mode === 'webhook') {
            await this.registerWebhook();
            return;
        }
        const isWebhookRemoved = await this.attempt('deleteWebhook', () =>
            this.client.deleteWebhook(),
        );
        if (!isWebhookRemoved) {
            this.logger.warn(
                { mode },
                'Telegram webhook may still be set, polling can hit conflicts until it is removed',
            );
        }
        this.poller.start();
        this.logger.info({ mode }, 'Telegram updates polling started');
    }

    private async registerWebhook(): Promise<void> {
        const webhook = this.settings.webhook;
        if (webhook === null) return;
        const isRegistered = await this.attempt('setWebhook', () =>
            this.client.setWebhook({
                url: webhook.url,
                secretToken: webhook.secret,
                allowedUpdates: ['message'],
            }),
        );
        if (isRegistered) this.logger.info({ mode: 'webhook' }, 'Telegram webhook registered');
    }

    private async attempt(method: BotMethod, call: () => Promise<void>): Promise<boolean> {
        try {
            await call();
            return true;
        } catch (error: unknown) {
            this.logger.error({ err: error, method }, 'Telegram updates setup failed');
            return false;
        }
    }
}
