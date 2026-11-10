import { Injectable } from '@nestjs/common';
import { BotMessengerPort, type SentBotMessage } from '../../application/ports/bot-messenger.port';
import { TelegramMessageMetricsPort } from '../../application/ports/telegram-message-metrics.port';
import { sendErrorReasonOf } from '../../application/send-error-reason';
import { BotApiClient } from './bot-api-client';

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
            const sent = await this.client.sendMessage(chatId, html);
            this.metrics.recordSent('reply');
            return sent;
        } catch (error: unknown) {
            this.metrics.recordSendError(sendErrorReasonOf(error));
            throw error;
        }
    }
}
