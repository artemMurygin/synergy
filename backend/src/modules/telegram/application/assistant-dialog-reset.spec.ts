import { describe, expect, it } from 'vitest';
import { ResetTelegramDialogUseCase } from '../../assistant/application/reset-telegram-dialog.use-case';
import { ActiveRunRegistry } from '../../assistant/infrastructure/active-run-registry';
import { InMemoryChatSessionRepository } from '../../assistant/interface/http/testing/in-memory-chat-session-repository';
import type { LinkedBotSender } from '../domain/bot-sender';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { AssistantDialogReset } from './assistant-dialog-reset';
import { DialogResetPort } from './ports/dialog-reset.port';
import { NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';

const SENDER: LinkedBotSender = {
    kind: 'linked',
    userId: USER_ID,
    login: 'ivanov',
    link: TelegramLink.link(
        USER_ID,
        TelegramIdentity.of({ telegramUserId: 1001n, chatId: 1001n, username: null }),
        NOW,
    ),
};

describe('AssistantDialogReset', () => {
    it('removes the Telegram dialog of the sender in the assistant', async () => {
        const sessions = new InMemoryChatSessionRepository();
        const deletedThreads: string[] = [];
        const reset = new AssistantDialogReset(
            new ResetTelegramDialogUseCase(
                sessions,
                {
                    deleteThread: (id: string) => {
                        deletedThreads.push(id);
                        return Promise.resolve();
                    },
                    latestCheckpointId: () => Promise.resolve(null),
                },
                new ActiveRunRegistry(),
            ),
        );
        const dialog = await sessions.findOrCreateTelegram(USER_ID);

        await reset.reset(SENDER);

        expect(reset).toBeInstanceOf(DialogResetPort);
        expect(await sessions.findTelegram(USER_ID)).toBeNull();
        expect(deletedThreads).toEqual([dialog.id]);
    });
});
