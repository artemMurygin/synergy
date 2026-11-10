import { Injectable } from '@nestjs/common';
import { TelegramNotLinkedError } from '../domain/errors';
import { ClockPort } from '../domain/ports/clock.port';
import { TelegramLinkRepositoryPort } from '../domain/ports/telegram-link-repository.port';
import { TelegramSettingsPort } from './ports/telegram-settings.port';
import { toTelegramLinkStatusView, type TelegramLinkStatusView } from './telegram-link-status-view';

@Injectable()
export class SetTelegramNotificationsUseCase {
    constructor(
        private readonly settings: TelegramSettingsPort,
        private readonly links: TelegramLinkRepositoryPort,
        private readonly clock: ClockPort,
    ) {}

    async execute(userId: string, isEnabled: boolean): Promise<TelegramLinkStatusView> {
        const link = await this.links.findByUserId(userId);
        if (link === null) throw new TelegramNotLinkedError();
        const now = this.clock.now();
        if (isEnabled) link.enableNotifications(now);
        else link.disableNotifications(now);
        await this.links.save(link);
        return toTelegramLinkStatusView(this.settings.isConfigured(), link);
    }
}
