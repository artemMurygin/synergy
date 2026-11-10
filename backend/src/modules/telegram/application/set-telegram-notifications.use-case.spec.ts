import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramNotLinkedError } from '../domain/errors';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { testTelegramSettings } from '../testing/telegram-settings.fixture';
import { SetTelegramNotificationsUseCase } from './set-telegram-notifications.use-case';
import { FixedClock, InMemoryTelegramLinkRepository, NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const LATER = new Date('2026-03-01T13:00:00.000Z');

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

    it('saves the changed link', async () => {
        const saved: TelegramLink[] = [];
        const saveLink = links.save.bind(links);
        links.save = (link) => {
            saved.push(link);
            return saveLink(link);
        };

        await useCase.execute(USER_ID, false);

        expect(saved.map((link) => link.notificationsEnabled)).toEqual([false]);
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
