import { Injectable } from '@nestjs/common';
import { TelegramNotConfiguredError } from '../domain/errors';
import { LinkToken } from '../domain/link-token';
import { ClockPort } from '../domain/ports/clock.port';
import { LinkTokenStorePort } from '../domain/ports/link-token-store.port';
import { TelegramSettingsPort } from './ports/telegram-settings.port';
import type { TelegramActor } from './telegram-actor';

export interface IssuedLinkToken {
    readonly url: string;
    readonly expiresAt: Date;
}

@Injectable()
export class IssueLinkTokenUseCase {
    constructor(
        private readonly settings: TelegramSettingsPort,
        private readonly tokens: LinkTokenStorePort,
        private readonly clock: ClockPort,
    ) {}

    async execute(actor: TelegramActor): Promise<IssuedLinkToken> {
        const botUsername = this.settings.botUsername;
        if (!this.settings.isConfigured() || botUsername === null) {
            throw new TelegramNotConfiguredError();
        }
        const ttlSeconds = this.settings.linkTokenTtlSeconds;
        const token = LinkToken.generate(ttlSeconds, this.clock.now());
        await this.tokens.save(token.digest(), actor.userId, ttlSeconds);
        return { url: token.deepLink(botUsername), expiresAt: token.expiresAt };
    }
}
