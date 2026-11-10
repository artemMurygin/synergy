export interface SentBotMessage {
    readonly messageId: bigint;
}

export abstract class BotMessengerPort {
    abstract send(chatId: bigint, html: string): Promise<SentBotMessage>;
}
