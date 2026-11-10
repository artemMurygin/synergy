import { Injectable } from '@nestjs/common';
import { BotMessengerPort, type SentBotMessage } from '../../application/ports/bot-messenger.port';
import { BotApiClient } from './bot-api-client';

@Injectable()
export class BotMessenger extends BotMessengerPort {
    constructor(private readonly client: BotApiClient) {
        super();
    }

    send(chatId: bigint, html: string): Promise<SentBotMessage> {
        return this.client.sendMessage(chatId, html);
    }
}
