import { Inject, Injectable, type OnModuleDestroy, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { BotUpdateDispatcher } from '../../application/bot-update-dispatcher';
import { TransientDeliveryError } from '../../application/errors';
import { TelegramUpdateMetricsPort } from '../../application/ports/telegram-update-metrics.port';
import { PollerLock } from '../cache/poller-lock';
import { BotApiClient, BotApiConflictError } from './bot-api-client';

export const TELEGRAM_POLLER_TIMINGS = Symbol('TELEGRAM_POLLER_TIMINGS');

export interface PollerTimings {
    readonly lockTtlMs: number;
    readonly renewIntervalMs: number;
    readonly lockRetryMs: number;
    readonly pollTimeoutSeconds: number;
    readonly errorBackoffMs: number;
}

export const DEFAULT_POLLER_TIMINGS: PollerTimings = {
    lockTtlMs: 60_000,
    renewIntervalMs: 20_000,
    lockRetryMs: 10_000,
    pollTimeoutSeconds: 25,
    errorBackoffMs: 5_000,
};

const updateIdSchema = z.object({ update_id: z.number().int().nonnegative() });

type PollResult = 'continue' | 'conflict';

function sleep(durationMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        const finish = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', finish);
            resolve();
        };
        const timer = setTimeout(finish, durationMs);
        signal.addEventListener('abort', finish, { once: true });
    });
}

@Injectable()
export class TelegramUpdatesPoller implements OnModuleDestroy {
    private readonly timings: PollerTimings;
    private readonly stopController = new AbortController();
    private loop: Promise<void> | null = null;
    private offset = 0;

    constructor(
        private readonly lock: PollerLock,
        private readonly client: BotApiClient,
        private readonly dispatcher: BotUpdateDispatcher,
        private readonly metrics: TelegramUpdateMetricsPort,
        private readonly logger: PinoLogger,
        @Optional() @Inject(TELEGRAM_POLLER_TIMINGS) timings?: Partial<PollerTimings>,
    ) {
        this.logger.setContext(TelegramUpdatesPoller.name);
        this.timings = { ...DEFAULT_POLLER_TIMINGS, ...timings };
    }

    start(): void {
        if (this.loop !== null || this.stopController.signal.aborted) return;
        this.loop = this.run();
    }

    async onModuleDestroy(): Promise<void> {
        this.stopController.abort();
        await this.loop;
    }

    private async run(): Promise<void> {
        const stopSignal = this.stopController.signal;
        while (!stopSignal.aborted) {
            try {
                const isAcquired = await this.lock.acquire(this.timings.lockTtlMs);
                if (isAcquired) await this.pollWhileHolding();
                else await sleep(this.timings.lockRetryMs, stopSignal);
            } catch (error: unknown) {
                this.logger.error({ err: error }, 'Telegram poller lock failed');
                await sleep(this.timings.errorBackoffMs, stopSignal);
            }
        }
    }

    private async pollWhileHolding(): Promise<void> {
        this.logger.info({}, 'Telegram poller lock acquired');
        const hold = new AbortController();
        const signal = AbortSignal.any([this.stopController.signal, hold.signal]);
        const renewal = setInterval(() => {
            void this.renew(hold);
        }, this.timings.renewIntervalMs);
        let result: PollResult = 'continue';
        try {
            while (!signal.aborted && result === 'continue') {
                result = await this.pollOnce(signal);
            }
        } finally {
            clearInterval(renewal);
            await this.release();
        }
        if (result === 'conflict') {
            await sleep(this.timings.lockRetryMs, this.stopController.signal);
        }
    }

    private async pollOnce(signal: AbortSignal): Promise<PollResult> {
        let updates: unknown[];
        try {
            updates = await this.client.getUpdates({
                offset: this.offset,
                timeoutSeconds: this.timings.pollTimeoutSeconds,
                allowedUpdates: ['message'],
                signal,
            });
        } catch (error: unknown) {
            if (signal.aborted) return 'continue';
            if (error instanceof BotApiConflictError) {
                this.logger.warn({}, 'Telegram polling conflict, waiting for the lock');
                return 'conflict';
            }
            if (error instanceof TransientDeliveryError) {
                this.logger.warn({ err: error }, 'Telegram getUpdates failed');
            } else {
                this.logger.error({ err: error }, 'Telegram getUpdates failed');
            }
            await sleep(this.timings.errorBackoffMs, signal);
            return 'continue';
        }
        for (const update of updates) {
            if (this.stopController.signal.aborted) break;
            await this.handle(update);
        }
        return 'continue';
    }

    private async handle(update: unknown): Promise<void> {
        const parsed = updateIdSchema.safeParse(update);
        if (parsed.success) {
            this.offset = Math.max(this.offset, parsed.data.update_id + 1);
        }
        this.metrics.recordUpdate(await this.dispatcher.dispatch(update));
    }

    private async renew(hold: AbortController): Promise<void> {
        try {
            const isExtended = await this.lock.extend(this.timings.lockTtlMs);
            if (isExtended) return;
            this.logger.warn({}, 'Telegram poller lock lost');
        } catch (error: unknown) {
            this.logger.warn({ err: error }, 'Telegram poller lock renewal failed');
        }
        hold.abort();
    }

    private async release(): Promise<void> {
        try {
            await this.lock.release();
        } catch (error: unknown) {
            this.logger.warn({ err: error }, 'Telegram poller lock release failed');
        }
    }
}
