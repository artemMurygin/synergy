import { createHash, randomBytes } from 'node:crypto';
import { normalizeBotUsername } from './bot-username';
import { InvalidLinkTokenSettingsError } from './errors';
import { MS_IN_SECOND } from './time-units';

const TOKEN_BYTES = 24;
const WELL_FORMED_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const DEEP_LINK_BASE_URL = 'https://t.me/';

function digestValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export class LinkToken {
    private constructor(
        readonly value: string,
        readonly expiresAt: Date,
    ) {}

    static generate(ttlSeconds: number, now: Date): LinkToken {
        if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
            throw new InvalidLinkTokenSettingsError('Link token ttl must be a positive integer');
        }
        const value = randomBytes(TOKEN_BYTES).toString('base64url');
        return new LinkToken(value, new Date(now.getTime() + ttlSeconds * MS_IN_SECOND));
    }

    static isWellFormed(startParameter: string): boolean {
        return WELL_FORMED_TOKEN.test(startParameter);
    }

    static digestOf(startParameter: string): string {
        return digestValue(startParameter);
    }

    digest(): string {
        return digestValue(this.value);
    }

    deepLink(botUsername: string): string {
        const normalizedUsername = normalizeBotUsername(botUsername).trim();
        if (normalizedUsername.length === 0) {
            throw new InvalidLinkTokenSettingsError('Bot username must not be empty');
        }
        const url = new URL(`${DEEP_LINK_BASE_URL}${encodeURIComponent(normalizedUsername)}`);
        url.searchParams.set('start', this.value);
        return url.toString();
    }
}
