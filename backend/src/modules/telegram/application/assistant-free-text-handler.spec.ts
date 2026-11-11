import { describe, expect, it, vi } from 'vitest';
import type { AskInTelegramUseCase } from '../../assistant/application/ask-in-telegram.use-case';
import type { LinkedBotSender } from '../domain/bot-sender';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { AssistantFreeTextHandler } from './assistant-free-text-handler';
import { escapeHtml } from './bot-replies';
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

        await expect(handler.handle(SENDER, 'поставь Пете задачу')).resolves.toEqual([
            'Задача создана',
        ]);

        expect(execute).toHaveBeenCalledWith(USER_ID, 'поставь Пете задачу', undefined);
    });

    it('passes the cancel signal to the use case', async () => {
        const { handler, execute } = handlerWith('ответ');
        const cancel = new AbortController();

        await handler.handle(SENDER, 'вопрос', cancel.signal);

        expect(execute).toHaveBeenCalledWith(USER_ID, 'вопрос', cancel.signal);
    });

    it('returns the fixed refusal of the agent for a topic outside tasks as is', async () => {
        const refusal = 'Я работаю только с задачами.';
        const { handler, execute } = handlerWith(refusal);

        await expect(handler.handle(SENDER, 'рассчитай цену по прайсу')).resolves.toEqual([
            refusal,
        ]);

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('escapes HTML of the answer because the bot sends HTML', async () => {
        const { handler } = handlerWith('a < b & c > d');

        await expect(handler.handle(SENDER, 'q')).resolves.toEqual(['a &lt; b &amp; c &gt; d']);
    });

    it('splits a long answer into escaped parts within the Telegram limit without losing text', async () => {
        const answer = `${'Абзац ответа <важно> & детали.\n'.repeat(120)}\n`.repeat(3);
        const { handler } = handlerWith(answer);

        const parts = await handler.handle(SENDER, 'q');

        expect(parts.length).toBeGreaterThan(1);
        for (const part of parts) expect(part.length).toBeLessThanOrEqual(4096);
        expect(parts.join('')).toBe(escapeHtml(answer));
    });

    it('does not truncate the answer with an ellipsis', async () => {
        const { handler } = handlerWith('<'.repeat(6000));

        const parts = await handler.handle(SENDER, 'q');

        expect(parts.join('')).toBe('&lt;'.repeat(6000));
        expect(parts.join('')).not.toContain('…');
    });
});
