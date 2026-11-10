import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramNotLinkedError } from '../domain/errors';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { testTelegramSettings } from '../testing/telegram-settings.fixture';
import { SetTelegramNotificationsUseCase } from './set-telegram-notifications.use-case';
import { FixedClock, InMemoryTelegramLinkRepository, NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const LATER = new Date('2026-03-01T13:00:00.000Z');

function linkOf(telegramUserId: bigint, chatId: bigint, username: string): TelegramLink {
    return TelegramLink.link(
        USER_ID,
        TelegramIdentity.of({ telegramUserId, chatId, username }),
        NOW,
    );
}

class StaleReadTelegramLinkRepository extends InMemoryTelegramLinkRepository {
    constructor(private readonly staleLink: TelegramLink) {
        super();
    }

    override findByUserId(): Promise<TelegramLink | null> {
        return Promise.resolve(this.staleLink);
    }
}

describe('SetTelegramNotificationsUseCase', () => {
    let links: InMemoryTelegramLinkRepository;
    let clock: FixedClock;
    let useCase: SetTelegramNotificationsUseCase;

    beforeEach(async () => {
        links = new InMemoryTelegramLinkRepository();
        clock = new FixedClock();
        useCase = new SetTelegramNotificationsUseCase(testTelegramSettings(), links, clock);
        await links.save(
            TelegramLink.link(
                USER_ID,
                TelegramIdentity.of({
                    telegramUserId: 1001n,
                    chatId: 1001n,
                    username: 'ivanov_tg',
                }),
                NOW,
            ),
        );
        clock.current = LATER;
    });

    it('disables the notifications and returns the status', async () => {
        const status = await useCase.execute(USER_ID, false);

        expect(status).toEqual({
            isAvailable: true,
            isLinked: true,
            username: 'ivanov_tg',
            notificationsEnabled: false,
            linkedAt: NOW,
        });
        const link = await links.findByUserId(USER_ID);
        expect(link?.notificationsEnabled).toBe(false);
        expect(link?.updatedAt).toEqual(LATER);
    });

    it('enables the notifications again', async () => {
        await useCase.execute(USER_ID, false);

        const status = await useCase.execute(USER_ID, true);

        expect(status).toMatchObject({ isLinked: true, notificationsEnabled: true });
        expect((await links.findByUserId(USER_ID))?.notificationsEnabled).toBe(true);
    });

    it('does not restore a link removed while the switch was running', async () => {
        const stale = new StaleReadTelegramLinkRepository(linkOf(1001n, 1001n, 'ivanov_tg'));
        const racing = new SetTelegramNotificationsUseCase(testTelegramSettings(), stale, clock);

        await expect(racing.execute(USER_ID, false)).rejects.toBeInstanceOf(TelegramNotLinkedError);
        expect(stale.linksByUserId.size).toBe(0);
    });

    it('does not write the previous account back over a relinked one', async () => {
        const stale = new StaleReadTelegramLinkRepository(linkOf(1001n, 1001n, 'ivanov_tg'));
        await stale.save(linkOf(2002n, 2002n, 'new_tg'));
        const racing = new SetTelegramNotificationsUseCase(testTelegramSettings(), stale, clock);

        const status = await racing.execute(USER_ID, false);

        expect(status).toMatchObject({ username: 'new_tg', notificationsEnabled: false });
        const link = stale.linksByUserId.get(USER_ID);
        expect(link?.telegramUserId).toBe(2002n);
        expect(link?.chatId).toBe(2002n);
        expect(link?.notificationsEnabled).toBe(false);
    });

    it('switches only the link of the expected telegram account', async () => {
        await expect(useCase.execute(USER_ID, false, 3003n)).rejects.toBeInstanceOf(
            TelegramNotLinkedError,
        );
        expect((await links.findByUserId(USER_ID))?.notificationsEnabled).toBe(true);

        await expect(useCase.execute(USER_ID, false, 1001n)).resolves.toMatchObject({
            notificationsEnabled: false,
        });
    });

    it('reports the bot availability from the settings', async () => {
        const unconfigured = new SetTelegramNotificationsUseCase(
            testTelegramSettings({ updatesMode: 'off' }),
            links,
            clock,
        );

        await expect(unconfigured.execute(USER_ID, true)).resolves.toMatchObject({
            isAvailable: false,
            isLinked: true,
        });
    });

    it('rejects a user without a link', async () => {
        await expect(
            useCase.execute('0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d', false),
        ).rejects.toBeInstanceOf(TelegramNotLinkedError);
    });
});
