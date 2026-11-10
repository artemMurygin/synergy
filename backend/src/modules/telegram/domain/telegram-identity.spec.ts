import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { TelegramIdentity } from './telegram-identity';

describe('TelegramIdentity', () => {
    it('keeps positive identifiers and the username', () => {
        const identity = TelegramIdentity.of({
            telegramUserId: 1001n,
            chatId: 1001n,
            username: 'ivanov_tg',
        });

        expect(identity.telegramUserId).toBe(1001n);
        expect(identity.chatId).toBe(1001n);
        expect(identity.username).toBe('ivanov_tg');
    });

    it.each([
        { raw: '  ivanov_tg ', expected: 'ivanov_tg' },
        { raw: '@ivanov_tg', expected: 'ivanov_tg' },
        { raw: ' @Ivanov_TG', expected: 'Ivanov_TG' },
        { raw: '', expected: null },
        { raw: '  @ ', expected: null },
        { raw: null, expected: null },
    ])('normalizes the username "$raw" to $expected', ({ raw, expected }) => {
        const identity = TelegramIdentity.of({ telegramUserId: 1n, chatId: 2n, username: raw });

        expect(identity.username).toBe(expected);
    });

    it.each([
        { telegramUserId: 0n, chatId: 1n },
        { telegramUserId: -5n, chatId: 1n },
        { telegramUserId: 1n, chatId: 0n },
        { telegramUserId: 1n, chatId: -100123n },
    ])('rejects non-positive identifiers $telegramUserId / $chatId', (ids) => {
        expect(() => TelegramIdentity.of({ ...ids, username: null })).toThrow(ArgumentInvalidError);
    });

    it('does not put the identifiers into the error message', () => {
        let message = '';
        try {
            TelegramIdentity.of({ telegramUserId: -987654321n, chatId: 1n, username: null });
        } catch (error: unknown) {
            message = error instanceof Error ? error.message : '';
        }

        expect(message).not.toBe('');
        expect(message).not.toContain('987654321');
    });

    it('compares identities by value', () => {
        const first = TelegramIdentity.of({ telegramUserId: 1n, chatId: 2n, username: '@a_b' });
        const same = TelegramIdentity.of({ telegramUserId: 1n, chatId: 2n, username: 'a_b' });
        const other = TelegramIdentity.of({ telegramUserId: 1n, chatId: 3n, username: 'a_b' });

        expect(first.equals(same)).toBe(true);
        expect(first.equals(other)).toBe(false);
    });
});
