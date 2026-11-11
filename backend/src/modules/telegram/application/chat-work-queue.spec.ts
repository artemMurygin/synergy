import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkQueue, TYPING_INTERVAL_MS } from './chat-work-queue';
import { RecordingBotMessenger, silentLogger } from './test-doubles';

const CHAT = 1001n;
const OTHER_CHAT = 2002n;

interface Deferred {
    readonly promise: Promise<void>;
    resolve(): void;
    reject(error: Error): void;
}

function deferred(): Deferred {
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<void>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

describe('ChatWorkQueue', () => {
    let messenger: RecordingBotMessenger;
    let logger: PinoLogger;
    let queue: ChatWorkQueue;

    function typingIn(chatId: bigint): number {
        return messenger.chatActions.filter((action) => action.chatId === chatId).length;
    }

    async function settle(): Promise<void> {
        await vi.advanceTimersByTimeAsync(0);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        messenger = new RecordingBotMessenger();
        logger = silentLogger();
        queue = new ChatWorkQueue(messenger, logger);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('repeats the typing indicator every 4 seconds', () => {
        expect(TYPING_INTERVAL_MS).toBe(4_000);
    });

    it('starts the work without waiting for it and returns true', () => {
        const work = deferred();
        const run = vi.fn(() => work.promise);

        expect(queue.tryRun(CHAT, run)).toBe(true);

        expect(run).toHaveBeenCalledTimes(1);
    });

    it('returns false for a busy chat and does not start the second work', () => {
        const work = deferred();
        queue.tryRun(CHAT, () => work.promise);
        const second = vi.fn(() => Promise.resolve());

        expect(queue.tryRun(CHAT, second)).toBe(false);

        expect(second).not.toHaveBeenCalled();
    });

    it('does not block other chats', () => {
        const work = deferred();
        queue.tryRun(CHAT, () => work.promise);
        const other = vi.fn(() => Promise.resolve());

        expect(queue.tryRun(OTHER_CHAT, other)).toBe(true);

        expect(other).toHaveBeenCalledTimes(1);
    });

    it('frees the chat when the work is done', async () => {
        const work = deferred();
        queue.tryRun(CHAT, () => work.promise);

        work.resolve();
        await settle();

        const next = vi.fn(() => Promise.resolve());
        expect(queue.tryRun(CHAT, next)).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('shows typing at once and every 4 seconds while the work runs, then stops', async () => {
        const work = deferred();
        queue.tryRun(CHAT, () => work.promise);

        expect(typingIn(CHAT)).toBe(1);
        await vi.advanceTimersByTimeAsync(TYPING_INTERVAL_MS - 1);
        expect(typingIn(CHAT)).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(typingIn(CHAT)).toBe(2);
        await vi.advanceTimersByTimeAsync(TYPING_INTERVAL_MS * 2);
        expect(typingIn(CHAT)).toBe(4);

        work.resolve();
        await settle();
        await vi.advanceTimersByTimeAsync(TYPING_INTERVAL_MS * 3);

        expect(typingIn(CHAT)).toBe(4);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the work going when the typing indicator fails', async () => {
        messenger.chatActionFailure = new Error('Telegram is down');
        const warn = vi.spyOn(logger, 'warn');
        const work = deferred();
        let finished = false;

        queue.tryRun(CHAT, async () => {
            await work.promise;
            finished = true;
        });
        await settle();
        work.resolve();
        await settle();

        expect(finished).toBe(true);
        expect(warn).toHaveBeenCalled();
    });

    it('logs a failed work and frees the chat', async () => {
        const error = vi.spyOn(logger, 'error');
        const failure = new Error('agent crashed');

        queue.tryRun(CHAT, () => Promise.reject(failure));
        await settle();

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ err: failure }),
            expect.any(String),
        );
        expect(queue.tryRun(CHAT, () => Promise.resolve())).toBe(true);
        await settle();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('logs a work that throws synchronously and frees the chat', async () => {
        const error = vi.spyOn(logger, 'error');

        expect(
            queue.tryRun(CHAT, () => {
                throw new Error('sync failure');
            }),
        ).toBe(true);
        await settle();

        expect(error).toHaveBeenCalled();
        expect(queue.tryRun(CHAT, () => Promise.resolve())).toBe(true);
    });

    it('keeps the work current until the generation of the chat is reset', async () => {
        const work = deferred();
        let isCurrent: () => boolean = () => false;
        queue.tryRun(CHAT, (current) => {
            isCurrent = current;
            return work.promise;
        });

        expect(isCurrent()).toBe(true);
        queue.resetGeneration(CHAT);
        expect(isCurrent()).toBe(false);

        work.resolve();
        await settle();
        expect(isCurrent()).toBe(false);
    });

    it('stops typing for a work whose generation was reset', async () => {
        const work = deferred();
        queue.tryRun(CHAT, () => work.promise);

        queue.resetGeneration(CHAT);
        await vi.advanceTimersByTimeAsync(TYPING_INTERVAL_MS * 3);

        expect(typingIn(CHAT)).toBe(1);
        work.resolve();
        await settle();
    });

    it('frees the chat at once when its generation is reset', async () => {
        const stale = deferred();
        queue.tryRun(CHAT, () => stale.promise);

        queue.resetGeneration(CHAT);

        const fresh = deferred();
        let isFreshCurrent: () => boolean = () => false;
        expect(
            queue.tryRun(CHAT, (current) => {
                isFreshCurrent = current;
                return fresh.promise;
            }),
        ).toBe(true);
        stale.resolve();
        await settle();
        expect(isFreshCurrent()).toBe(true);
        expect(queue.tryRun(CHAT, () => Promise.resolve())).toBe(false);
        fresh.resolve();
        await settle();
    });

    it('aborts the signal of the work whose generation was reset', async () => {
        const work = deferred();
        let signal: AbortSignal | undefined;
        queue.tryRun(CHAT, (_current, workSignal) => {
            signal = workSignal;
            return work.promise;
        });

        expect(signal?.aborted).toBe(false);
        queue.resetGeneration(CHAT);
        expect(signal?.aborted).toBe(true);
        work.resolve();
        await settle();
    });

    it('gives the next work a current generation after a reset', async () => {
        const first = deferred();
        queue.tryRun(CHAT, () => first.promise);
        queue.resetGeneration(CHAT);
        first.resolve();
        await settle();

        let isCurrent: () => boolean = () => false;
        queue.tryRun(CHAT, (current) => {
            isCurrent = current;
            return Promise.resolve();
        });

        expect(isCurrent()).toBe(true);
    });

    it('does nothing when the generation of an idle chat is reset', () => {
        expect(() => {
            queue.resetGeneration(CHAT);
        }).not.toThrow();
        expect(queue.tryRun(CHAT, () => Promise.resolve())).toBe(true);
    });

    it('does not touch the work of another chat on reset', () => {
        const work = deferred();
        let isCurrent: () => boolean = () => false;
        queue.tryRun(OTHER_CHAT, (current) => {
            isCurrent = current;
            return work.promise;
        });

        queue.resetGeneration(CHAT);

        expect(isCurrent()).toBe(true);
        work.resolve();
    });
});
