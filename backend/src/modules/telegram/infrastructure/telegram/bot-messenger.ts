import { Injectable } from '@nestjs/common';
import {
    BotMessengerPort,
    type BotChatAction,
    type SentBotMessage,
} from '../../application/ports/bot-messenger.port';
import { TelegramMessageMetricsPort } from '../../application/ports/telegram-message-metrics.port';
import { unescapeHtml } from '../../application/bot-replies';
import { sendErrorReasonOf } from '../../application/send-error-reason';
import { BotApiClient, UnparsableEntitiesError } from './bot-api-client';

@Injectable()
export class BotMessenger extends BotMessengerPort {
    constructor(
        private readonly client: BotApiClient,
        private readonly metrics: TelegramMessageMetricsPort,
    ) {
        super();
    }

    async send(chatId: bigint, html: string): Promise<SentBotMessage> {
        try {
            const sent = await this.sendFormattedOrPlain(chatId, html);
            this.metrics.recordSent('reply');
            return sent;
        } catch (error: unknown) {
            this.metrics.recordSendError(sendErrorReasonOf(error));
            throw error;
        }
    }

    async sendChatAction(chatId: bigint, action: BotChatAction): Promise<void> {
        await this.client.sendChatAction(chatId, action);
    }

    /**
     * A part whose HTML Telegram cannot parse is resent as plain text, so the text still arrives;
     * its entities are turned back into characters, so the user sees «&», not «&amp;».
     */
    private async sendFormattedOrPlain(chatId: bigint, html: string): Promise<SentBotMessage> {
        try {
            return await this.client.sendMessage(chatId, html);
        } catch (error: unknown) {
            if (!(error instanceof UnparsableEntitiesError)) throw error;
            return this.client.sendMessage(chatId, unescapeHtml(html), { plainText: true });
        }
    }
}
