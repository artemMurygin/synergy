export abstract class NotifierPort {
    abstract send(chatId: string, text: string): Promise<void>;
}
