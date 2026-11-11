import { Injectable } from '@nestjs/common';
import { AskInTelegramUseCase } from '../../assistant/application/ask-in-telegram.use-case';
import type { LinkedBotSender } from '../domain/bot-sender';
import { escapeHtml } from './bot-replies';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';

const MAX_MESSAGE_LENGTH = 4096;
const TRUNCATION_MARK = '…';

/** Free text of a linked user goes to the task agent; the answer is sent back as bot HTML. */
@Injectable()
export class AssistantFreeTextHandler extends FreeTextHandlerPort {
    constructor(private readonly ask: AskInTelegramUseCase) {
        super();
    }

    async handle(sender: LinkedBotSender, text: string): Promise<string> {
        return fitMessage(await this.ask.execute(sender.userId, text));
    }
}

/** Escapes the answer and cuts it so that the escaped text fits one Telegram message. */
function fitMessage(answer: string): string {
    let raw = answer;
    let html = escapeHtml(raw);
    while (html.length > MAX_MESSAGE_LENGTH) {
        raw = raw.slice(0, Math.floor(raw.length * 0.9));
        html = escapeHtml(raw) + TRUNCATION_MARK;
    }
    return html;
}
