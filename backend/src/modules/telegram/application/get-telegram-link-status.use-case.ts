import { Injectable } from '@nestjs/common';
import { TelegramLinkRepositoryPort } from '../domain/ports/telegram-link-repository.port';
import { TelegramSettingsPort } from './ports/telegram-settings.port';
import type { TelegramActor } from './telegram-actor';
import { toTelegramLinkStatusView, type TelegramLinkStatusView } from './telegram-link-status-view';

@Injectable()
export class GetTelegramLinkStatusUseCase {
    constructor(
        private readonly settings: TelegramSettingsPort,
        private readonly links: TelegramLinkRepositoryPort,
    ) {}

    async execute(actor: TelegramActor): Promise<TelegramLinkStatusView> {
        const link = await this.links.findByUserId(actor.userId);
        return toTelegramLinkStatusView(this.settings.isConfigured(), link);
    }
}
