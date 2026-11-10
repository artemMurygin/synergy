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

    async execute(
        userId: string,
        isEnabled: boolean,
        telegramUserId?: bigint,
    ): Promise<TelegramLinkStatusView> {
        const link = await this.links.setNotificationsEnabled({
            userId,
            isEnabled,
            now: this.clock.now(),
            telegramUserId,
        });
        if (link === null) throw new TelegramNotLinkedError();
        return toTelegramLinkStatusView(this.settings.isConfigured(), link);
    }
}
