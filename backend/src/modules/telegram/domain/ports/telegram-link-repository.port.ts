import type { TelegramLink } from '../telegram-link';

export abstract class TelegramLinkRepositoryPort {
    abstract findByUserId(userId: string): Promise<TelegramLink | null>;

    abstract findByTelegramUserId(telegramUserId: bigint): Promise<TelegramLink | null>;

    abstract save(link: TelegramLink): Promise<void>;

    abstract deleteByUserId(userId: string): Promise<TelegramLink | null>;

    abstract deleteByUserIdAndChatId(userId: string, chatId: bigint): Promise<TelegramLink | null>;
}
