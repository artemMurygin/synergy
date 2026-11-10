import { describe, expect, it } from 'vitest';
import { TelegramIdentityMismatchError } from './errors';
import { TelegramIdentity } from './telegram-identity';
import { TelegramLink } from './telegram-link';

const USER_ID = '7f1c2a3e-0000-4000-8000-000000000001';
const LINKED_AT = new Date('2026-11-11T10:00:00Z');
const LATER = new Date('2026-11-11T11:00:00Z');

const identity = (
    overrides: Partial<{ chatId: bigint; username: string | null }> = {},
): TelegramIdentity =>
    TelegramIdentity.of({
        telegramUserId: 1001n,
        chatId: overrides.chatId ?? 1001n,
        username: overrides.username === undefined ? 'ivanov_tg' : overrides.username,
    });

describe('TelegramLink', () => {
    it('creates a link with notifications enabled', () => {
        const link = TelegramLink.link(USER_ID, identity(), LINKED_AT);

        expect(link.userId).toBe(USER_ID);
        expect(link.identity.equals(identity())).toBe(true);
        expect(link.telegramUserId).toBe(1001n);
        expect(link.chatId).toBe(1001n);
        expect(link.username).toBe('ivanov_tg');
        expect(link.notificationsEnabled).toBe(true);
        expect(link.linkedAt).toEqual(LINKED_AT);
        expect(link.updatedAt).toEqual(LINKED_AT);
    });

    it('restores a stored link', () => {
        const link = TelegramLink.restore({
            userId: USER_ID,
            identity: identity(),
            notificationsEnabled: false,
            linkedAt: LINKED_AT,
            updatedAt: LATER,
        });

        expect(link.notificationsEnabled).toBe(false);
        expect(link.linkedAt).toEqual(LINKED_AT);
        expect(link.updatedAt).toEqual(LATER);
    });

    it('relinks the same Telegram user with a new chat and username and keeps the notifications setting', () => {
        const link = TelegramLink.link(USER_ID, identity(), LINKED_AT);
        link.disableNotifications(LINKED_AT);

        link.relink(identity({ chatId: 2002n, username: null }), LATER);

        expect(link.chatId).toBe(2002n);
        expect(link.username).toBeNull();
        expect(link.telegramUserId).toBe(1001n);
        expect(link.notificationsEnabled).toBe(false);
        expect(link.linkedAt).toEqual(LINKED_AT);
        expect(link.updatedAt).toEqual(LATER);
    });

    it('rejects relinking to another Telegram user', () => {
        const link = TelegramLink.link(USER_ID, identity(), LINKED_AT);
        const stranger = TelegramIdentity.of({
            telegramUserId: 3003n,
            chatId: 3003n,
            username: 'x',
        });

        expect(() => {
            link.relink(stranger, LATER);
        }).toThrow(TelegramIdentityMismatchError);
        expect(link.telegramUserId).toBe(1001n);
        expect(link.updatedAt).toEqual(LINKED_AT);
    });

    it('disables and enables notifications and updates updatedAt', () => {
        const link = TelegramLink.link(USER_ID, identity(), LINKED_AT);

        link.disableNotifications(LATER);
        expect(link.notificationsEnabled).toBe(false);
        expect(link.updatedAt).toEqual(LATER);

        const evenLater = new Date(LATER.getTime() + 1000);
        link.enableNotifications(evenLater);
        expect(link.notificationsEnabled).toBe(true);
        expect(link.updatedAt).toEqual(evenLater);
    });
});
