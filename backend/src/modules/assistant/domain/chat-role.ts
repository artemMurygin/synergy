import { z } from 'zod';

export const CHAT_ROLES = ['user', 'agent'] as const;

export type ChatRole = (typeof CHAT_ROLES)[number];

export const ChatRole = {
    parse(value: unknown): ChatRole {
        return z.enum(CHAT_ROLES).parse(value);
    },
};
