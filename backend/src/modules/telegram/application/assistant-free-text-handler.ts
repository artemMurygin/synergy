import { Injectable } from '@nestjs/common';
import { AskInTelegramUseCase } from '../../assistant/application/ask-in-telegram.use-case';
import type { LinkedBotSender } from '../domain/bot-sender';
import { escapeHtml } from './bot-replies';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
import { splitTelegramMessage } from './split-telegram-message';

/** Free text of a linked user goes to the task agent; the answer comes back as parts of bot HTML. */
@Injectable()
export class AssistantFreeTextHandler extends FreeTextHandlerPort {
    constructor(private readonly ask: AskInTelegramUseCase) {
        super();
    }

    async handle(sender: LinkedBotSender, text: string, cancel?: AbortSignal): Promise<string[]> {
        const answer = await this.ask.execute(sender.userId, text, cancel);
        return splitTelegramMessage(escapeHtml(answer));
    }
}
