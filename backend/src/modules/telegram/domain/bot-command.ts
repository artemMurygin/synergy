export const BOT_COMMAND_NAMES = ['start', 'help', 'unlink', 'mute', 'unmute'] as const;

export type BotCommandName = (typeof BOT_COMMAND_NAMES)[number];

const COMMAND_HEAD_PATTERN = /^\/[A-Za-z0-9_]+(?:@[A-Za-z0-9_]+)?$/;
const WHITESPACE = /\s/;
const MENTION_SEPARATOR = '@';

function isBotCommandName(name: string): name is BotCommandName {
    return BOT_COMMAND_NAMES.some((commandName) => commandName === name);
}

function normalizeBotUsername(botUsername: string): string {
    return botUsername.trim().replace(/^@/, '').toLowerCase();
}

export class BotCommand {
    private constructor(
        readonly name: BotCommandName,
        readonly argument: string | null,
    ) {}

    static parse(text: string, botUsername: string): BotCommand | null {
        const trimmed = text.trim();
        const separatorIndex = trimmed.search(WHITESPACE);
        const head = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
        if (!COMMAND_HEAD_PATTERN.test(head)) return null;
        const mentionIndex = head.indexOf(MENTION_SEPARATOR);
        if (mentionIndex !== -1) {
            const mention = head.slice(mentionIndex + 1).toLowerCase();
            if (mention !== normalizeBotUsername(botUsername)) return null;
        }
        const name = head.slice(1, mentionIndex === -1 ? undefined : mentionIndex).toLowerCase();
        if (!isBotCommandName(name)) return null;
        const argument = separatorIndex === -1 ? '' : trimmed.slice(separatorIndex).trim();
        return new BotCommand(name, argument.length === 0 ? null : argument);
    }
}
