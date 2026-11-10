import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { InvalidLinkTokenError, TelegramAccountTakenError } from '../domain/errors';
import type { LinkResult } from '../domain/link-result';
import { LinkToken } from '../domain/link-token';
import { ClockPort } from '../domain/ports/clock.port';
import { LinkTokenStorePort } from '../domain/ports/link-token-store.port';
import { TelegramLinkRepositoryPort } from '../domain/ports/telegram-link-repository.port';
import type { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { BotReplies } from './bot-replies';
import { BotMessengerPort } from './ports/bot-messenger.port';
import { UserDirectoryPort } from './ports/user-directory.port';

export interface LinkAccountCommand {
    readonly token: string;
    readonly identity: TelegramIdentity;
}

interface LinkOutcome {
    readonly userId: string;
    readonly result: LinkResult;
}

@Injectable()
export class LinkAccountUseCase {
    constructor(
        private readonly transactions: TransactionRunnerPort,
        private readonly tokens: LinkTokenStorePort,
        private readonly users: UserDirectoryPort,
        private readonly links: TelegramLinkRepositoryPort,
        private readonly messenger: BotMessengerPort,
        private readonly clock: ClockPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(LinkAccountUseCase.name);
    }

    async execute(command: LinkAccountCommand): Promise<LinkResult> {
        if (!LinkToken.isWellFormed(command.token)) throw new InvalidLinkTokenError();
        const outcome = await this.transactions.run(() => this.link(command));
        this.logger.info({ userId: outcome.userId }, 'Telegram account linked');
        await Promise.all([
            this.notify(
                outcome.userId,
                command.identity.chatId,
                BotReplies.linked(outcome.result.login),
            ),
            this.notifyPreviousChat(outcome.userId, outcome.result.previousChatId),
        ]);
        return outcome.result;
    }

    private async link(command: LinkAccountCommand): Promise<LinkOutcome> {
        const userId = await this.tokens.consume(LinkToken.digestOf(command.token));
        if (userId === null) throw new InvalidLinkTokenError();
        const user = await this.users.findActiveById(userId);
        if (user === null) throw new InvalidLinkTokenError();
        const { identity } = command;
        const owner = await this.links.findByTelegramUserId(identity.telegramUserId);
        if (owner !== null && owner.userId !== userId) throw new TelegramAccountTakenError();
        const now = this.clock.now();
        const current = await this.links.findByUserId(userId);
        let previousChatId: bigint | null = null;
        let link: TelegramLink;
        if (current !== null && current.telegramUserId === identity.telegramUserId) {
            current.relink(identity, now);
            link = current;
        } else {
            if (current !== null) {
                await this.links.deleteByUserId(userId);
                previousChatId = current.chatId;
            }
            link = TelegramLink.link(userId, identity, now);
        }
        await this.links.save(link);
        return { userId, result: { kind: 'linked', login: user.login, previousChatId } };
    }

    private async notifyPreviousChat(userId: string, previousChatId: bigint | null): Promise<void> {
        if (previousChatId === null) return;
        await this.notify(userId, previousChatId, BotReplies.unlinked());
    }

    private async notify(userId: string, chatId: bigint, html: string): Promise<void> {
        try {
            await this.messenger.send(chatId, html);
        } catch (error: unknown) {
            this.logger.warn({ err: error, userId }, 'Telegram link message was not sent');
        }
    }
}
