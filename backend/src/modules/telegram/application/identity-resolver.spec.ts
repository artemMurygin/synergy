import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { IdentityResolver } from './identity-resolver';
import { InMemoryTelegramLinkRepository, InMemoryUserDirectory, NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const IDENTITY = TelegramIdentity.of({
    telegramUserId: 1001n,
    chatId: 1001n,
    username: 'ivanov_tg',
});

describe('IdentityResolver', () => {
    let links: InMemoryTelegramLinkRepository;
    let users: InMemoryUserDirectory;
    let resolver: IdentityResolver;

    beforeEach(() => {
        links = new InMemoryTelegramLinkRepository();
        users = new InMemoryUserDirectory();
        resolver = new IdentityResolver(links, users);
    });

    it('treats a sender without a link as anonymous', async () => {
        users.add({ id: USER_ID, login: 'ivanov' });

        await expect(resolver.resolve(IDENTITY)).resolves.toEqual({ kind: 'anonymous' });
    });

    it('resolves a linked active user by the Telegram user id', async () => {
        const link = TelegramLink.link(USER_ID, IDENTITY, NOW);
        await links.save(link);
        users.add({ id: USER_ID, login: 'ivanov' });

        await expect(
            resolver.resolve(
                TelegramIdentity.of({ telegramUserId: 1001n, chatId: 1001n, username: null }),
            ),
        ).resolves.toEqual({ kind: 'linked', userId: USER_ID, login: 'ivanov', link });
    });

    it('treats a disabled user as anonymous and keeps the link', async () => {
        await links.save(TelegramLink.link(USER_ID, IDENTITY, NOW));

        await expect(resolver.resolve(IDENTITY)).resolves.toEqual({ kind: 'anonymous' });
        expect(await links.findByUserId(USER_ID)).not.toBeNull();
    });
});
