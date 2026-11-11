import { describe, expect, it, vi } from 'vitest';
import type { AskInTelegramUseCase } from '../../assistant/application/ask-in-telegram.use-case';
import type { LinkedBotSender } from '../domain/bot-sender';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { AssistantFreeTextHandler } from './assistant-free-text-handler';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
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

function handlerWith(reply: string | Error): {
    handler: AssistantFreeTextHandler;
    execute: ReturnType<typeof vi.fn>;
} {
    const execute = vi.fn(() =>
        reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply),
    );
    const handler = new AssistantFreeTextHandler({ execute } as unknown as AskInTelegramUseCase);
    return { handler, execute };
}

describe('AssistantFreeTextHandler', () => {
    it('implements the free text extension point', () => {
        expect(handlerWith('x').handler).toBeInstanceOf(FreeTextHandlerPort);
    });

    it('passes the user id of the sender and the text to the use case and returns the answer', async () => {
        const { handler, execute } = handlerWith('Задача создана');

        await expect(handler.handle(SENDER, 'поставь Пете задачу')).resolves.toBe('Задача создана');

        expect(execute).toHaveBeenCalledWith(USER_ID, 'поставь Пете задачу');
    });

    it('returns the fixed refusal of the agent for a topic outside tasks as is', async () => {
        const refusal = 'Я работаю только с задачами.';
        const { handler, execute } = handlerWith(refusal);

        await expect(handler.handle(SENDER, 'рассчитай цену по прайсу')).resolves.toBe(refusal);

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('escapes HTML of the answer because the bot sends HTML', async () => {
        const { handler } = handlerWith('a < b & c > d');

        await expect(handler.handle(SENDER, 'q')).resolves.toBe('a &lt; b &amp; c &gt; d');
    });

    it('keeps a long answer within the Telegram message limit', async () => {
        const { handler } = handlerWith('<'.repeat(6000));

        const reply = await handler.handle(SENDER, 'q');

        expect(reply.length).toBeLessThanOrEqual(4096);
        expect(reply).toContain('&lt;');
    });
});
