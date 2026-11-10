import { describe, expect, it } from 'vitest';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { BotReplies } from './bot-replies';
import { NotSupportedFreeTextHandler } from './not-supported-free-text-handler';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
import { NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';

describe('NotSupportedFreeTextHandler', () => {
    it('implements the free text extension point', () => {
        expect(new NotSupportedFreeTextHandler()).toBeInstanceOf(FreeTextHandlerPort);
    });

    it('answers that text requests are not supported yet with the command list', async () => {
        const link = TelegramLink.link(
            USER_ID,
            TelegramIdentity.of({ telegramUserId: 1001n, chatId: 1001n, username: null }),
            NOW,
        );
        const handler: FreeTextHandlerPort = new NotSupportedFreeTextHandler();

        await expect(
            handler.handle(
                { kind: 'linked', userId: USER_ID, login: 'ivanov', link },
                'Подготовь КП для клиента',
            ),
        ).resolves.toBe(BotReplies.freeTextNotSupported());
        expect(link.notificationsEnabled).toBe(true);
        expect(link.updatedAt).toEqual(NOW);
    });
});
