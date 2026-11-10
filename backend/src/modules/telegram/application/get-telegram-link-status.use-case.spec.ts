import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { testTelegramSettings } from '../testing/telegram-settings.fixture';
import { GetTelegramLinkStatusUseCase } from './get-telegram-link-status.use-case';
import { InMemoryTelegramLinkRepository, NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const LATER = new Date('2026-03-02T08:00:00.000Z');

function linkOf(username: string | null): TelegramLink {
    return TelegramLink.link(
        USER_ID,
        TelegramIdentity.of({ telegramUserId: 1001n, chatId: 2002n, username }),
        NOW,
    );
}

describe('GetTelegramLinkStatusUseCase', () => {
    let links: InMemoryTelegramLinkRepository;

    beforeEach(() => {
        links = new InMemoryTelegramLinkRepository();
    });

    it('reports an available bot without a link', async () => {
        const useCase = new GetTelegramLinkStatusUseCase(testTelegramSettings(), links);

        await expect(useCase.execute({ userId: USER_ID })).resolves.toEqual({
            isAvailable: true,
            isLinked: false,
        });
    });

    it('returns the link fields without internal Telegram ids', async () => {
        const link = linkOf('ivanov_tg');
        link.disableNotifications(LATER);
        await links.save(link);
        const useCase = new GetTelegramLinkStatusUseCase(testTelegramSettings(), links);

        const status = await useCase.execute({ userId: USER_ID });

        expect(status).toEqual({
            isAvailable: true,
            isLinked: true,
            username: 'ivanov_tg',
            notificationsEnabled: false,
            linkedAt: NOW,
        });
        expect(JSON.stringify(status)).not.toMatch(/1001|2002/);
    });

    it('keeps a link without username', async () => {
        await links.save(linkOf(null));
        const useCase = new GetTelegramLinkStatusUseCase(testTelegramSettings(), links);

        await expect(useCase.execute({ userId: USER_ID })).resolves.toMatchObject({
            isLinked: true,
            username: null,
            notificationsEnabled: true,
        });
    });

    it.each([
        ['no bot token', { botToken: undefined }],
        ['no bot username', { botUsername: undefined }],
        ['updates mode off', { updatesMode: 'off' as const }],
    ])('marks the bot unavailable with %s', async (_case, overrides) => {
        await links.save(linkOf('ivanov_tg'));
        const useCase = new GetTelegramLinkStatusUseCase(testTelegramSettings(overrides), links);

        await expect(useCase.execute({ userId: USER_ID })).resolves.toMatchObject({
            isAvailable: false,
            isLinked: true,
        });
    });

    it('looks up only the link of the actor', async () => {
        await links.save(linkOf('ivanov_tg'));
        const useCase = new GetTelegramLinkStatusUseCase(testTelegramSettings(), links);

        await expect(
            useCase.execute({ userId: '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d' }),
        ).resolves.toEqual({ isAvailable: true, isLinked: false });
    });
});
