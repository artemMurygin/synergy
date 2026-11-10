const MENTION_PREFIX = /^@/;

export function normalizeBotUsername(botUsername: string): string {
    return botUsername.trim().replace(MENTION_PREFIX, '');
}
