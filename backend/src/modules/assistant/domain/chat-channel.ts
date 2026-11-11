import { z } from 'zod';

export const CHAT_CHANNELS = ['app', 'telegram'] as const;

/** Where a chat lives: the client applications or the Telegram bot. */
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export const ChatChannel = {
    parse(value: unknown): ChatChannel {
        return z.enum(CHAT_CHANNELS).parse(value);
    },
};
