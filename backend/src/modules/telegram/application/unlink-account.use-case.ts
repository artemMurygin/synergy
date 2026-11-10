import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { TelegramLinkRepositoryPort } from '../domain/ports/telegram-link-repository.port';
import { BotReplies } from './bot-replies';
import { BotMessengerPort } from './ports/bot-messenger.port';

@Injectable()
export class UnlinkAccountUseCase {
    constructor(
        private readonly transactions: TransactionRunnerPort,
        private readonly links: TelegramLinkRepositoryPort,
        private readonly messenger: BotMessengerPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(UnlinkAccountUseCase.name);
    }

    async execute(userId: string): Promise<void> {
        const removed = await this.transactions.run(() => this.links.deleteByUserId(userId));
        if (removed === null) return;
        this.logger.info({ userId }, 'Telegram account unlinked');
        try {
            await this.messenger.send(removed.chatId, BotReplies.unlinked());
        } catch (error: unknown) {
            this.logger.warn({ err: error, userId }, 'Telegram unlink message was not sent');
        }
    }
}
