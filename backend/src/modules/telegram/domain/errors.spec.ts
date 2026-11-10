import { describe, expect, it } from 'vitest';
import {
    InvalidLinkTokenError,
    TelegramAccountTakenError,
    TelegramIdentityMismatchError,
    TelegramNotConfiguredError,
    TelegramNotLinkedError,
} from './errors';

describe('telegram domain errors', () => {
    it.each([
        { error: new InvalidLinkTokenError(), code: 'TELEGRAM_INVALID_LINK_TOKEN' },
        { error: new TelegramAccountTakenError(), code: 'TELEGRAM_ACCOUNT_TAKEN' },
        { error: new TelegramNotLinkedError(), code: 'TELEGRAM_NOT_LINKED' },
        { error: new TelegramNotConfiguredError(), code: 'TELEGRAM_NOT_CONFIGURED' },
        { error: new TelegramIdentityMismatchError(), code: 'TELEGRAM_IDENTITY_MISMATCH' },
    ])('$code has a stable code and a generic message', ({ error, code }) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe(code);
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.metadata).toBeUndefined();
    });
});
