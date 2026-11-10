import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { BotCommand } from '../domain/bot-command';
import type { BotSender, LinkedBotSender } from '../domain/bot-sender';
import {
    InvalidLinkTokenError,
    TelegramAccountTakenError,
    TelegramNotLinkedError,
} from '../domain/errors';
import { IncomingMessage } from '../domain/incoming-message';
import { TelegramIdentity } from '../domain/telegram-identity';
import { BotReplies } from './bot-replies';
import { IdentityResolver } from './identity-resolver';
import { LinkAccountUseCase } from './link-account.use-case';
import { BotMessengerPort } from './ports/bot-messenger.port';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
import { TelegramSettingsPort } from './ports/telegram-settings.port';
import { UpdateDeduplicatorPort } from './ports/update-deduplicator.port';
import { SetTelegramNotificationsUseCase } from './set-telegram-notifications.use-case';
import { UnlinkAccountUseCase } from './unlink-account.use-case';

export type DispatchOutcome = 'handled' | 'duplicate' | 'ignored' | 'failed';

const updateEnvelopeSchema = z.object({ update_id: z.number().int().nonnegative() });

const privateTextMessageSchema = z.object({
    message: z.object({
        chat: z.object({ id: z.number().int().positive(), type: z.literal('private') }),
        from: z.object({ id: z.number().int().positive(), username: z.string().optional() }),
        text: z.string(),
    }),
});

const NO_BOT_USERNAME = '';

@Injectable()
export class BotUpdateDispatcher {
    constructor(
        private readonly deduplicator: UpdateDeduplicatorPort,
        private readonly resolver: IdentityResolver,
        private readonly linkAccount: LinkAccountUseCase,
        private readonly unlinkAccount: UnlinkAccountUseCase,
        private readonly setNotifications: SetTelegramNotificationsUseCase,
        private readonly freeText: FreeTextHandlerPort,
        private readonly messenger: BotMessengerPort,
        private readonly settings: TelegramSettingsPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(BotUpdateDispatcher.name);
    }

    async dispatch(update: unknown): Promise<DispatchOutcome> {
        const envelope = updateEnvelopeSchema.safeParse(update);
        if (!envelope.success) return 'ignored';
        const updateId = envelope.data.update_id;
        try {
            const isFirstDelivery = await this.deduplicator.markProcessed(updateId);
            if (!isFirstDelivery) return 'duplicate';
            const message = this.parseMessage(updateId, update);
            if (message === null) return 'ignored';
            await this.handle(message);
            return 'handled';
        } catch (error: unknown) {
            this.logger.error({ err: error, updateId }, 'Telegram update processing failed');
            return 'failed';
        }
    }

    private parseMessage(updateId: number, update: unknown): IncomingMessage | null {
        const parsed = privateTextMessageSchema.safeParse(update);
        if (!parsed.success) return null;
        const { chat, from, text } = parsed.data.message;
        return IncomingMessage.of({
            updateId,
            sender: TelegramIdentity.of({
                telegramUserId: BigInt(from.id),
                chatId: BigInt(chat.id),
                username: from.username ?? null,
            }),
            text,
        });
    }

    private async handle(message: IncomingMessage): Promise<void> {
        const command = BotCommand.parse(
            message.text,
            this.settings.botUsername ?? NO_BOT_USERNAME,
        );
        if (command?.name === 'start' && command.argument !== null) {
            await this.link(message, command.argument);
            return;
        }
        const sender = await this.resolver.resolve(message.sender);
        const reply = await this.replyFor(sender, command, message.text);
        if (reply !== null) await this.messenger.send(message.sender.chatId, reply);
    }

    private async link(message: IncomingMessage, token: string): Promise<void> {
        const reply = await this.linkOrExplain(message.sender, token);
        if (reply !== null) await this.messenger.send(message.sender.chatId, reply);
    }

    private async linkOrExplain(identity: TelegramIdentity, token: string): Promise<string | null> {
        try {
            await this.linkAccount.execute({ token, identity });
            return null;
        } catch (error: unknown) {
            if (error instanceof InvalidLinkTokenError) return BotReplies.invalidLinkToken();
            if (error instanceof TelegramAccountTakenError) return BotReplies.accountTaken();
            throw error;
        }
    }

    private async replyFor(
        sender: BotSender,
        command: BotCommand | null,
        text: string,
    ): Promise<string | null> {
        if (sender.kind === 'anonymous') return BotReplies.notLinked();
        if (command === null) return this.freeText.handle(sender, text);
        switch (command.name) {
            case 'start':
            case 'help':
                return BotReplies.help(sender.login);
            case 'unlink':
                await this.unlinkAccount.execute(sender.userId);
                return null;
            case 'mute':
                return this.toggleNotifications(sender, false);
            case 'unmute':
                return this.toggleNotifications(sender, true);
        }
    }

    private async toggleNotifications(
        sender: LinkedBotSender,
        isEnabled: boolean,
    ): Promise<string> {
        try {
            await this.setNotifications.execute(
                sender.userId,
                isEnabled,
                sender.link.telegramUserId,
            );
        } catch (error: unknown) {
            if (error instanceof TelegramNotLinkedError) return BotReplies.notLinked();
            throw error;
        }
        return isEnabled ? BotReplies.notificationsEnabled() : BotReplies.notificationsDisabled();
    }
}
