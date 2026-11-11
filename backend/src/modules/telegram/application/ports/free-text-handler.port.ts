import type { LinkedBotSender } from '../../domain/bot-sender';

export abstract class FreeTextHandlerPort {
    /**
     * Answers free text of a linked user with the parts of bot HTML to send one after another.
     * `cancel` stops the answer when the user started a new dialog meanwhile.
     */
    abstract handle(sender: LinkedBotSender, text: string, cancel?: AbortSignal): Promise<string[]>;
}
