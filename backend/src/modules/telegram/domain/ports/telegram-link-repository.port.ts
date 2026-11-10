import type { TelegramLink } from '../telegram-link';

export interface NotificationsSwitch {
    readonly userId: string;
    readonly isEnabled: boolean;
    readonly now: Date;
    readonly telegramUserId?: bigint;
}

export abstract class TelegramLinkRepositoryPort {
    abstract findByUserId(userId: string): Promise<TelegramLink | null>;

    abstract findByTelegramUserId(telegramUserId: bigint): Promise<TelegramLink | null>;

    abstract save(link: TelegramLink): Promise<void>;

    abstract setNotificationsEnabled(change: NotificationsSwitch): Promise<TelegramLink | null>;

    abstract deleteByUserId(userId: string): Promise<TelegramLink | null>;

    abstract deleteByUserIdAndChatId(userId: string, chatId: bigint): Promise<TelegramLink | null>;
}
