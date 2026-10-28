import { describe, expect, it, vi } from 'vitest';
import { PermanentNotifyError, TransientNotifyError } from '../../domain/errors/notify.errors';
import { NotifierAdapter } from './notifier.adapter';

const BOT_TOKEN = 'token-1';
const CHAT_ID = '555';
const TEXT = 'Deal has issues';

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

function createNotifier(fetchFn: typeof fetch): NotifierAdapter {
    return new NotifierAdapter({ botToken: BOT_TOKEN, timeoutMs: 1000 }, fetchFn);
}

describe('NotifierAdapter', () => {
    it('posts the message to the Bot API sendMessage method', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));

        await createNotifier(fetchFn).send(CHAT_ID, TEXT);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn).toHaveBeenCalledWith(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ chat_id: CHAT_ID, text: TEXT }),
            }),
        );
    });

    it('throws a transient error when the request fails', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

        await expect(createNotifier(fetchFn).send(CHAT_ID, TEXT)).rejects.toBeInstanceOf(
            TransientNotifyError,
        );
    });

    it.each([429, 500, 502, 503])('throws a transient error on status %i', async (status) => {
        const fetchFn = vi
            .fn()
            .mockResolvedValue(jsonResponse(status, { ok: false, description: 'retry later' }));

        await expect(createNotifier(fetchFn).send(CHAT_ID, TEXT)).rejects.toBeInstanceOf(
            TransientNotifyError,
        );
    });

    it('throws a transient error when the body is not json', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('<html>', { status: 502 }));

        await expect(createNotifier(fetchFn).send(CHAT_ID, TEXT)).rejects.toBeInstanceOf(
            TransientNotifyError,
        );
    });

    it.each([
        [403, 'Forbidden: bot was blocked by the user'],
        [400, 'Bad Request: chat not found'],
        [401, 'Unauthorized'],
    ])('throws a permanent error on status %i', async (status, description) => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse(status, { ok: false, description }));

        await expect(createNotifier(fetchFn).send(CHAT_ID, TEXT)).rejects.toBeInstanceOf(
            PermanentNotifyError,
        );
    });

    it('throws a permanent error when the bot token is missing', async () => {
        const fetchFn = vi.fn();
        const notifier = new NotifierAdapter({ botToken: undefined, timeoutMs: 1000 }, fetchFn);

        await expect(notifier.send(CHAT_ID, TEXT)).rejects.toBeInstanceOf(PermanentNotifyError);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('does not leak the bot token into error messages', async () => {
        const fetchFn = vi
            .fn()
            .mockRejectedValue(new TypeError(`failed https://api.telegram.org/bot${BOT_TOKEN}/x`));

        const error = await createNotifier(fetchFn)
            .send(CHAT_ID, TEXT)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(TransientNotifyError);
        expect(JSON.stringify(error)).not.toContain(BOT_TOKEN);
    });
});
