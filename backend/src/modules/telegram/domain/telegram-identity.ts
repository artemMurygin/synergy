import { InvalidTelegramIdentityError } from './errors';

export interface TelegramIdentityInput {
    readonly telegramUserId: bigint;
    readonly chatId: bigint;
    readonly username: string | null;
}

const USERNAME_PREFIX = /^@/;

function normalizeUsername(raw: string | null): string | null {
    if (raw === null) return null;
    const username = raw.trim().replace(USERNAME_PREFIX, '').trim();
    return username.length === 0 ? null : username;
}

export class TelegramIdentity {
    private constructor(
        readonly telegramUserId: bigint,
        readonly chatId: bigint,
        readonly username: string | null,
    ) {}

    static of(input: TelegramIdentityInput): TelegramIdentity {
        if (input.telegramUserId <= 0n) {
            throw new InvalidTelegramIdentityError('Telegram user id must be positive');
        }
        if (input.chatId <= 0n) {
            throw new InvalidTelegramIdentityError('Telegram chat id must be positive');
        }
        return new TelegramIdentity(
            input.telegramUserId,
            input.chatId,
            normalizeUsername(input.username),
        );
    }

    equals(other: TelegramIdentity): boolean {
        return (
            this.telegramUserId === other.telegramUserId &&
            this.chatId === other.chatId &&
            this.username === other.username
        );
    }
}
