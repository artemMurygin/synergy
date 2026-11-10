import type { LinkedBotSender } from '../../domain/bot-sender';

export abstract class FreeTextHandlerPort {
    abstract handle(sender: LinkedBotSender, text: string): Promise<string>;
}
