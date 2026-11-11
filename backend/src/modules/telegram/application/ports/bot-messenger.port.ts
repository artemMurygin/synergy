export interface SentBotMessage {
    readonly messageId: bigint;
}

export type BotChatAction = 'typing';

export abstract class BotMessengerPort {
    abstract send(chatId: bigint, html: string): Promise<SentBotMessage>;

    /** Shows a chat action such as «печатает…»; Telegram keeps it for about 5 seconds. */
    abstract sendChatAction(chatId: bigint, action: BotChatAction): Promise<void>;
}
