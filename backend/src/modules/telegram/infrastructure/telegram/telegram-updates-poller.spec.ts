import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Counter } from '@prometheus-io/client';
import type { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    type MockInstance,
    vi,
} from 'vitest';
import { connectTestRedis, disconnectTestRedis } from '../../../../shared/testing/test-redis';
import type { BotUpdateDispatcher } from '../../application/bot-update-dispatcher';
import { silentLogger } from '../../application/test-doubles';
import { BotApiStub, type BotApiStubReply } from '../../testing/bot-api-stub';
import { testBotUpdateDispatcher } from '../../testing/bot-update-dispatcher.fixture';
import { testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { PollerLock } from '../cache/poller-lock';
import { BotApiClient } from './bot-api-client';
import { TELEGRAM_UPDATES_METRIC, TelegramUpdateMetrics } from './telegram-update-metrics';
import { type PollerTimings, TelegramUpdatesPoller } from './telegram-updates-poller';

const FAST_TIMINGS: PollerTimings = {
    lockTtlMs: 600,
    renewIntervalMs: 150,
    lockRetryMs: 100,
    pollTimeoutSeconds: 1,
    errorBackoffMs: 100,
    maxErrorBackoffMs: 100,
};
const SLOW_RETRY_MS = 10_000;
const EMPTY_POLL: BotApiStubReply = { status: 200, body: { ok: true, result: [] }, delayMs: 30 };
const WAIT_TIMEOUT_MS = 5_000;

function update(updateId: number): Record<string, unknown> {
    return { update_id: updateId, message: { text: `/help ${String(updateId)}` } };
}

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error('Condition was not met in time');
        await delay(20);
    }
}

interface PollerInstance {
    readonly poller: TelegramUpdatesPoller;
    readonly stub: BotApiStub;
    readonly dispatch: MockInstance<BotUpdateDispatcher['dispatch']>;
    readonly logger: PinoLogger;
    readonly metrics: Counter<'result'>;
    polls(): number;
}

describe('TelegramUpdatesPoller (real Redis)', () => {
    let redis: Redis | null = null;
    const lockKey = `telegram:poller:lock:test-${randomUUID()}`;
    const instances: PollerInstance[] = [];

    beforeAll(async () => {
        redis = await connectTestRedis();
    });

    afterAll(async () => {
        await disconnectTestRedis(redis, [lockKey]);
    });

    beforeEach(async (ctx) => {
        if (redis === null) {
            ctx.skip();
            return;
        }
        await redis.del(lockKey);
    });

    afterEach(async () => {
        await Promise.all(instances.map(({ poller }) => poller.onModuleDestroy()));
        await Promise.all(instances.map(({ stub }) => stub.stop()));
        instances.length = 0;
    });

    function connected(): Redis {
        if (redis === null) throw new Error('Redis is not connected');
        return redis;
    }

    async function createInstance(timings: Partial<PollerTimings> = {}): Promise<PollerInstance> {
        const stub = await BotApiStub.start();
        stub.respond('getUpdates', EMPTY_POLL);
        const dispatcher = testBotUpdateDispatcher();
        const dispatch = vi.spyOn(dispatcher, 'dispatch').mockResolvedValue('handled');
        const logger = silentLogger();
        const metrics = new Counter({
            name: TELEGRAM_UPDATES_METRIC,
            help: 'test',
            labelNames: ['result'],
            registers: [],
        });
        const poller = new TelegramUpdatesPoller(
            new PollerLock(connected(), lockKey),
            new BotApiClient(testTelegramSettings({ apiBaseUrl: stub.baseUrl })),
            dispatcher,
            new TelegramUpdateMetrics(metrics),
            logger,
            { ...FAST_TIMINGS, ...timings },
        );
        const instance = {
            poller,
            stub,
            dispatch,
            logger,
            metrics,
            polls: () => stub.requestsOf('getUpdates').length,
        };
        instances.push(instance);
        return instance;
    }

    it('lets only the lock holder call getUpdates and keeps extending the lock', async () => {
        const first = await createInstance();
        const second = await createInstance();

        first.poller.start();
        await waitFor(() => first.polls() > 0);
        second.poller.start();
        await delay(FAST_TIMINGS.lockTtlMs * 3);

        expect(second.polls()).toBe(0);
        const pollsBefore = first.polls();
        await waitFor(() => first.polls() > pollsBefore);
        expect(await connected().pttl(lockKey)).toBeGreaterThan(0);
        expect(first.stub.requestsOf('getUpdates')[0]?.body).toEqual({
            offset: 0,
            timeout: FAST_TIMINGS.pollTimeoutSeconds,
            allowed_updates: ['message'],
        });
    });

    it('passes every update to the dispatcher in order and confirms them with the next offset', async () => {
        const holder = await createInstance();
        const batches: unknown[][] = [[update(10), update(11)]];
        holder.stub.respond('getUpdates', () => ({
            status: 200,
            body: { ok: true, result: batches.shift() ?? [] },
            delayMs: 30,
        }));
        holder.dispatch.mockResolvedValueOnce('failed');

        holder.poller.start();
        await waitFor(() => holder.polls() >= 2);

        expect(holder.dispatch.mock.calls).toEqual([[update(10)], [update(11)]]);
        expect(holder.stub.requestsOf('getUpdates')[1]?.body).toMatchObject({ offset: 12 });
        const { values } = await holder.metrics.get();
        expect(values).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ labels: { result: 'failed' }, value: 1 }),
                expect.objectContaining({ labels: { result: 'handled' }, value: 1 }),
            ]),
        );
    });

    it('keeps polling after an update that failed', async () => {
        const holder = await createInstance();
        const batches: unknown[][] = [[update(20), update(21)]];
        holder.stub.respond('getUpdates', () => ({
            status: 200,
            body: { ok: true, result: batches.shift() ?? [] },
            delayMs: 30,
        }));
        holder.dispatch.mockResolvedValueOnce('failed');

        holder.poller.start();
        await waitFor(() => holder.polls() >= 2);

        expect(holder.dispatch).toHaveBeenCalledTimes(2);
        expect(holder.stub.requestsOf('getUpdates')[1]?.body).toMatchObject({ offset: 22 });
    });

    it('hands polling over to the second instance after the holder stops', async () => {
        const first = await createInstance();
        const second = await createInstance();
        first.poller.start();
        await waitFor(() => first.polls() > 0);
        second.poller.start();

        await first.poller.onModuleDestroy();
        const firstPollsAfterStop = first.polls();

        await waitFor(() => second.polls() > 0);
        expect(first.polls()).toBe(firstPollsAfterStop);
    });

    it('stops polling when the lock is lost, and the second instance picks it up', async () => {
        const first = await createInstance({ lockRetryMs: SLOW_RETRY_MS });
        const second = await createInstance();
        first.poller.start();
        await waitFor(() => first.polls() > 0);
        second.poller.start();

        await connected().set(lockKey, 'foreign-owner', 'PX', FAST_TIMINGS.lockTtlMs);
        await delay(FAST_TIMINGS.renewIntervalMs * 2);
        const firstPollsAfterLoss = first.polls();

        await waitFor(() => second.polls() > 0);
        await delay(FAST_TIMINGS.renewIntervalMs * 2);
        expect(first.polls()).toBe(firstPollsAfterLoss);
    });

    it('releases the lock and waits for it again after 409 Conflict', async () => {
        const first = await createInstance({ lockRetryMs: SLOW_RETRY_MS });
        const second = await createInstance();
        const warn = vi.spyOn(first.logger, 'warn');
        first.stub.respond('getUpdates', {
            status: 409,
            body: {
                ok: false,
                error_code: 409,
                description: 'Conflict: terminated by other getUpdates request',
            },
        });
        first.poller.start();
        await waitFor(() => first.polls() > 0);
        second.poller.start();

        await waitFor(() => second.polls() > 0);

        expect(first.polls()).toBe(1);
        expect(warn).toHaveBeenCalledWith({}, 'Telegram polling conflict, waiting for the lock');
    });

    it('backs off exponentially while getUpdates keeps failing and resets after a success', async () => {
        const instance = await createInstance({ errorBackoffMs: 50, maxErrorBackoffMs: 400 });
        const errorLog = vi.spyOn(instance.logger, 'error');
        instance.stub.respond('getUpdates', {
            status: 401,
            body: { ok: false, error_code: 401, description: 'Unauthorized' },
        });
        instance.poller.start();

        await delay(1_000);

        expect(instance.polls()).toBeGreaterThanOrEqual(3);
        expect(instance.polls()).toBeLessThanOrEqual(6);
        expect(errorLog.mock.calls.length).toBe(instance.polls());

        instance.stub.respond('getUpdates', EMPTY_POLL);
        await waitFor(() => instance.dispatch.mock.calls.length === 0 && instance.polls() > 8);
    });

    it('aborts the long poll and releases the lock on onModuleDestroy', async () => {
        const holder = await createInstance();
        holder.stub.respond('getUpdates', {
            status: 200,
            body: { ok: true, result: [] },
            delayMs: 5_000,
        });
        holder.poller.start();
        await waitFor(() => holder.polls() > 0);

        const startedAt = Date.now();
        await holder.poller.onModuleDestroy();

        expect(Date.now() - startedAt).toBeLessThan(1_000);
        expect(await connected().exists(lockKey)).toBe(0);
        await delay(FAST_TIMINGS.lockRetryMs * 3);
        expect(holder.polls()).toBe(1);
    });
});
