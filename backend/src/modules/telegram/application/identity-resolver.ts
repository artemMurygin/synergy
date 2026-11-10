import { Injectable } from '@nestjs/common';
import type { BotSender } from '../domain/bot-sender';
import { TelegramLinkRepositoryPort } from '../domain/ports/telegram-link-repository.port';
import type { TelegramIdentity } from '../domain/telegram-identity';
import { UserDirectoryPort } from './ports/user-directory.port';

const ANONYMOUS: BotSender = { kind: 'anonymous' };

@Injectable()
export class IdentityResolver {
    constructor(
        private readonly links: TelegramLinkRepositoryPort,
        private readonly users: UserDirectoryPort,
    ) {}

    async resolve(identity: TelegramIdentity): Promise<BotSender> {
        const link = await this.links.findByTelegramUserId(identity.telegramUserId);
        if (link === null) return ANONYMOUS;
        const user = await this.users.findActiveById(link.userId);
        if (user === null) return ANONYMOUS;
        return { kind: 'linked', userId: user.id, login: user.login, link };
    }
}
