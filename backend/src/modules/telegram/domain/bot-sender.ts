import type { TelegramLink } from './telegram-link';

export interface AnonymousBotSender {
    readonly kind: 'anonymous';
}

export interface LinkedBotSender {
    readonly kind: 'linked';
    readonly userId: string;
    readonly login: string;
    readonly link: TelegramLink;
}

export type BotSender = AnonymousBotSender | LinkedBotSender;
