import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BotMessengerPort } from './ports/bot-messenger.port';

/** Telegram shows a chat action for about 5 seconds, so it is renewed a bit earlier. */
export const TYPING_INTERVAL_MS = 4_000;

/** Tells the work whether its result may still be sent: false after /new reset the chat. */
export type IsCurrentWork = () => boolean;

/**
 * The background work of a chat. `signal` is aborted when /new resets the chat, so the work
 * stops transcribing or asking the agent instead of finishing for nothing.
 */
export type ChatWork = (isCurrent: IsCurrentWork, signal: AbortSignal) => Promise<void>;

interface RunningWork {
    isCurrent: boolean;
    readonly controller: AbortController;
}

/**
 * Runs agent work of a chat in the background, one work per chat, in the process memory. While
 * a work runs the chat shows «печатает…». A message lost on restart is an accepted risk.
 */
@Injectable()
export class ChatWorkQueue {
    private readonly running = new Map<bigint, RunningWork>();

    constructor(
        private readonly messenger: BotMessengerPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(ChatWorkQueue.name);
    }

    /** Starts the work without waiting for it; false when the chat already has a work running. */
    tryRun(chatId: bigint, work: ChatWork): boolean {
        if (this.running.has(chatId)) return false;
        const running: RunningWork = { isCurrent: true, controller: new AbortController() };
        this.running.set(chatId, running);
        void this.run(chatId, running, work);
        return true;
    }

    /**
     * Marks the running work of the chat as stale and aborts it, so its result is not sent,
     * and frees the chat at once: the next message starts a new work right away.
     */
    resetGeneration(chatId: bigint): void {
        const running = this.running.get(chatId);
        if (running === undefined) return;
        running.isCurrent = false;
        this.running.delete(chatId);
        running.controller.abort();
    }

    private async run(chatId: bigint, running: RunningWork, work: ChatWork): Promise<void> {
        const showTyping = (): void => {
            if (running.isCurrent) this.showTyping(chatId);
        };
        showTyping();
        const typing = setInterval(showTyping, TYPING_INTERVAL_MS);
        try {
            await work(() => running.isCurrent, running.controller.signal);
        } catch (error: unknown) {
            this.logger.error({ err: error }, 'Telegram chat work failed');
        } finally {
            clearInterval(typing);
            // A reset work already gave its slot away, possibly to a newer work.
            if (this.running.get(chatId) === running) this.running.delete(chatId);
        }
    }

    private showTyping(chatId: bigint): void {
        this.messenger.sendChatAction(chatId, 'typing').catch((error: unknown) => {
            this.logger.warn({ err: error }, 'Telegram typing indicator failed');
        });
    }
}
