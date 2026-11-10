import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { sql, type DatabasePool } from 'slonik';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { RequestContext } from '../../context/request-context';
import type { DomainEvent } from '../../ddd';
import type { DomainEventRegistry, EventSubscriber } from '../application/domain-event-registry';
import { OutboxWakeUpPort } from '../application/outbox-wake-up.port';
import { PermanentDeliveryError, RetryLaterDeliveryError } from '../domain/delivery-errors';
import {
    FakeOutboxClock,
    InMemoryOutboxStore,
    RecordingOutboxMetrics,
} from '../testing/in-memory-outbox-store';
import {
    createOutboxTestDatabase,
    createRegistry,
    readDelivery,
    readDeliveries,
    readEventIds,
    setEventCreatedAt,
    thingHappened,
    ThingHappenedEvent,
    THING_HAPPENED,
    truncateOutbox,
    type OutboxTestDatabase,
} from '../testing/outbox-fixtures';
import { OutboxDomainEventPublisher } from './outbox-domain-event-publisher';
import { OutboxRelay } from './outbox-relay';
import { OutboxSettings } from './outbox-settings';
import { OutboxStore } from './outbox-store';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const START = new Date('2026-05-01T10:00:00Z');
const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;
const HOUR_MS = 60 * 60 * SECOND_MS;
const FIRST = 'testing.first';
const SECOND = 'testing.second';
const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 60_000;
const RETRY_STEP_MS = 10 * 60 * SECOND_MS;
const HANDLER_TIMEOUT_MS = 20_000;
const PENDING_GAUGE_INTERVAL_MS = 15_000;

const settings = new OutboxSettings({
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    maxAttempts: MAX_ATTEMPTS,
    retentionDays: 7,
    claimLeaseMs: LEASE_MS,
    handlerTimeoutMs: HANDLER_TIMEOUT_MS,
    pendingGaugeIntervalMs: PENDING_GAUGE_INTERVAL_MS,
});

const silentLogger = (): PinoLogger => new PinoLogger({ pinoHttp: { level: 'silent' } });

interface RecordingSubscriber extends EventSubscriber {
    readonly received: DomainEvent[];
}

function recordingSubscriber(
    name: string,
    behaviour: (event: DomainEvent) => Promise<void> = () => Promise.resolve(),
): RecordingSubscriber {
    const received: DomainEvent[] = [];
    return {
        name,
        received,
        handle: async (event) => {
            received.push(event);
            await behaviour(event);
        },
    };
}

function failingTimes(times: number): (event: DomainEvent) => Promise<void> {
    let failuresLeft = times;
    return () => {
        if (failuresLeft <= 0) return Promise.resolve();
        failuresLeft -= 1;
        return Promise.reject(new Error('subscriber failed'));
    };
}

function failingWith(failure: Error, times: number): (event: DomainEvent) => Promise<void> {
    let failuresLeft = times;
    return () => {
        if (failuresLeft <= 0) return Promise.resolve();
        failuresLeft -= 1;
        return Promise.reject(failure);
    };
}

describe('OutboxRelay (unit)', () => {
    let clock: FakeOutboxClock;
    let store: InMemoryOutboxStore;
    let metrics: RecordingOutboxMetrics;
    let logger: PinoLogger;
    let transactions: InMemoryTransactionRunner;

    function createRelay(
        registry: DomainEventRegistry,
        relaySettings: OutboxSettings = settings,
    ): OutboxRelay {
        return new OutboxRelay(
            store,
            registry,
            transactions,
            relaySettings,
            clock,
            metrics,
            logger,
        );
    }

    function addThing(aggregateId: string, subscribers: readonly string[]): ThingHappenedEvent {
        const event = thingHappened(aggregateId);
        store.addEvent(
            {
                id: event.id,
                eventType: THING_HAPPENED,
                aggregateId,
                payload: { label: event.label },
                metadata: event.metadata,
            },
            subscribers,
        );
        return event;
    }

    beforeEach(() => {
        clock = new FakeOutboxClock(START);
        store = new InMemoryOutboxStore(clock);
        metrics = new RecordingOutboxMetrics();
        logger = silentLogger();
        transactions = new InMemoryTransactionRunner();
    });

    it('can be woken up through the port', () => {
        expect(createRelay(createRegistry([]))).toBeInstanceOf(OutboxWakeUpPort);
    });

    describe('processBatch', () => {
        it('delivers the restored event and marks the delivery done', async () => {
            const subscriber = recordingSubscriber(FIRST);
            const relay = createRelay(createRegistry([subscriber]));
            const event = addThing('aggregate-1', [FIRST]);
            clock.advance(2 * SECOND_MS);

            const processedCount = await relay.processBatch();

            expect(processedCount).toBe(1);
            expect(subscriber.received).toHaveLength(1);
            expect(subscriber.received[0]).toBeInstanceOf(ThingHappenedEvent);
            expect(subscriber.received[0]).toMatchObject({ id: event.id, label: event.label });
            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'done',
                processedAt: clock.now(),
            });
            expect(metrics.processed).toEqual([{ subscriber: FIRST, result: 'done' }]);
            expect(metrics.lags).toEqual([{ subscriber: FIRST, lagSeconds: 2 }]);
        });

        it('marks the delivery done inside the same transaction as the subscriber', async () => {
            let wasInTransaction = false;
            const subscriber = recordingSubscriber(FIRST, () => {
                wasInTransaction = transactions.isInTransaction();
                return Promise.resolve();
            });
            const relay = createRelay(createRegistry([subscriber]));
            addThing('aggregate-1', [FIRST]);

            await relay.processBatch();

            expect(wasInTransaction).toBe(true);
            expect(transactions.commits).toBe(1);
        });

        it('runs the subscriber with the correlation id of the event', async () => {
            let seenCorrelationId = '';
            const subscriber = recordingSubscriber(FIRST, () => {
                seenCorrelationId = RequestContext.getCorrelationId();
                return Promise.resolve();
            });
            const relay = createRelay(createRegistry([subscriber]));
            addThing('aggregate-1', [FIRST]);

            await relay.processBatch();

            expect(seenCorrelationId).toBe('corr-1');
        });

        it('schedules a retry by the retry policy without calling other subscribers again', async () => {
            const healthy = recordingSubscriber(FIRST);
            const flaky = recordingSubscriber(SECOND, failingTimes(1));
            const relay = createRelay(createRegistry([healthy, flaky]));
            const event = addThing('aggregate-1', [FIRST, SECOND]);
            const warn = vi.spyOn(logger, 'warn');

            await relay.processBatch();

            expect(store.delivery(event.id, SECOND)).toMatchObject({
                status: 'pending',
                attempts: 1,
                nextAttemptAt: new Date(START.getTime() + SECOND_MS),
                lastError: 'subscriber failed',
            });
            expect(store.scheduleRetry).toHaveBeenCalledWith(
                expect.objectContaining({ eventId: event.id, subscriber: SECOND }),
                1,
                new Date(START.getTime() + SECOND_MS),
                'subscriber failed',
            );
            expect(warn).toHaveBeenCalledWith(
                expect.objectContaining({ eventId: event.id, subscriber: SECOND, attempt: 1 }),
                'Outbox delivery will be retried',
            );
            expect(metrics.processed).toContainEqual({ subscriber: SECOND, result: 'retry' });

            expect(await relay.processBatch()).toBe(0);
            clock.advance(SECOND_MS);
            expect(await relay.processBatch()).toBe(1);

            expect(healthy.received).toHaveLength(1);
            expect(flaky.received).toHaveLength(2);
            expect(store.delivery(event.id, SECOND)).toMatchObject({ status: 'done' });
        });

        it('marks the delivery failed when the attempts are exhausted', async () => {
            const failure = new Error('down');
            const broken = recordingSubscriber(FIRST, () => Promise.reject(failure));
            const relay = createRelay(createRegistry([broken]));
            const event = addThing('aggregate-1', [FIRST]);
            const error = vi.spyOn(logger, 'error');

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
                await relay.processBatch();
                clock.advance(RETRY_STEP_MS);
            }
            await relay.processBatch();

            expect(broken.received).toHaveLength(MAX_ATTEMPTS);
            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'failed',
                attempts: MAX_ATTEMPTS,
                lastError: 'down',
            });
            expect(store.markFailed).toHaveBeenCalledWith(
                expect.objectContaining({ eventId: event.id, subscriber: FIRST }),
                MAX_ATTEMPTS,
                'down',
                new Date(START.getTime() + (MAX_ATTEMPTS - 1) * RETRY_STEP_MS),
            );
            expect(error).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventId: event.id,
                    subscriber: FIRST,
                    attempts: MAX_ATTEMPTS,
                    err: failure,
                }),
                'Outbox delivery failed',
            );
            expect(metrics.processed.filter((entry) => entry.result === 'failed')).toEqual([
                { subscriber: FIRST, result: 'failed' },
            ]);
        });

        it('fails an event of an unknown type at once', async () => {
            const subscriber = recordingSubscriber(FIRST);
            const relay = createRelay(createRegistry([subscriber]));
            store.addEvent(
                {
                    id: randomUUID(),
                    eventType: 'testing.unknown',
                    aggregateId: 'aggregate-1',
                    payload: {},
                    metadata: { timestamp: 1, correlationId: 'corr-1' },
                },
                [FIRST],
            );
            const error = vi.spyOn(logger, 'error');

            await relay.processBatch();

            expect(store.deliveries[0]).toMatchObject({ status: 'failed', attempts: 1 });
            expect(store.scheduleRetry).not.toHaveBeenCalled();
            expect(subscriber.received).toEqual([]);
            expect(error).toHaveBeenCalledWith(
                expect.objectContaining({ subscriber: FIRST }),
                'Outbox delivery failed',
            );
            expect(metrics.processed).toEqual([{ subscriber: FIRST, result: 'failed' }]);
        });

        it('fails an event with an invalid payload at once', async () => {
            const subscriber = recordingSubscriber(FIRST);
            const relay = createRelay(createRegistry([subscriber]));
            store.addEvent(
                {
                    id: randomUUID(),
                    eventType: THING_HAPPENED,
                    aggregateId: 'aggregate-1',
                    payload: { label: 42 },
                    metadata: { timestamp: 1, correlationId: 'corr-1' },
                },
                [FIRST],
            );

            await relay.processBatch();

            expect(store.deliveries[0]).toMatchObject({ status: 'failed', attempts: 1 });
            expect(subscriber.received).toEqual([]);
        });

        it('retries an event that fails to restore without stopping the rest of the batch', async () => {
            const subscriber = recordingSubscriber(FIRST);
            const registry = createRegistry([subscriber]);
            const broken = addThing('aggregate-1', [FIRST]);
            const healthy = addThing('aggregate-2', [FIRST]);
            const restore = registry.restore.bind(registry);
            vi.spyOn(registry, 'restore').mockImplementation((record) => {
                if (record.id === broken.id) throw new Error('restore crashed');
                return restore(record);
            });
            const relay = createRelay(registry);

            await relay.processBatch();

            expect(store.delivery(broken.id, FIRST)).toMatchObject({
                status: 'pending',
                attempts: 1,
                lastError: 'restore crashed',
            });
            expect(store.delivery(healthy.id, FIRST)).toMatchObject({ status: 'done' });
            expect(subscriber.received.map((event) => event.id)).toEqual([healthy.id]);
        });

        it('leaves a delivery of a subscriber unknown to this instance for another instance', async () => {
            const relay = createRelay(createRegistry([recordingSubscriber(FIRST)]));
            const event = addThing('aggregate-1', ['testing.newer-version']);

            expect(await relay.processBatch()).toBe(0);

            expect(store.delivery(event.id, 'testing.newer-version')).toMatchObject({
                status: 'pending',
                attempts: 0,
            });
            expect(store.markFailed).not.toHaveBeenCalled();
        });

        it('fails at once a delivery whose subscriber is not subscribed to the event type', async () => {
            const registry = createRegistry([]);
            registry.subscribe('testing.other', recordingSubscriber(SECOND));
            const relay = createRelay(registry);
            const event = addThing('aggregate-1', [SECOND]);

            await relay.processBatch();

            expect(store.delivery(event.id, SECOND)).toMatchObject({
                status: 'failed',
                attempts: 1,
                lastError: 'Subscriber is not registered',
            });
            expect(store.scheduleRetry).not.toHaveBeenCalled();
            expect(metrics.processed).toEqual([{ subscriber: SECOND, result: 'failed' }]);
        });

        it('schedules a retry when the subscriber exceeds the handler timeout', async () => {
            vi.useFakeTimers();
            try {
                const hanging = recordingSubscriber(
                    FIRST,
                    () => new Promise<void>(() => undefined),
                );
                const relay = createRelay(createRegistry([hanging]));
                const event = addThing('aggregate-1', [FIRST]);

                const processing = relay.processBatch();
                await vi.advanceTimersByTimeAsync(HANDLER_TIMEOUT_MS);
                await processing;

                expect(store.delivery(event.id, FIRST)).toMatchObject({
                    status: 'pending',
                    attempts: 1,
                });
                expect(store.delivery(event.id, FIRST)?.lastError).toContain('timed out');
                expect(metrics.processed).toEqual([{ subscriber: FIRST, result: 'retry' }]);
            } finally {
                vi.useRealTimers();
            }
        });

        it('does not write the result of a delivery whose lease was taken over', async () => {
            const subscriber = recordingSubscriber(FIRST, () => {
                store.takeOverLease(event.id, FIRST);
                return Promise.reject(new Error('subscriber failed'));
            });
            const relay = createRelay(createRegistry([subscriber]));
            const event = addThing('aggregate-1', [FIRST]);
            const warn = vi.spyOn(logger, 'warn');

            await relay.processBatch();

            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'pending',
                lastError: null,
            });
            expect(metrics.processed).toEqual([]);
            expect(warn).toHaveBeenCalledWith(
                expect.objectContaining({ eventId: event.id, subscriber: FIRST }),
                'Outbox delivery lease was lost, result discarded',
            );
        });

        it('rolls back the subscriber work when the lease is lost before done is written', async () => {
            const subscriber = recordingSubscriber(FIRST, () => {
                store.takeOverLease(event.id, FIRST);
                return Promise.resolve();
            });
            const relay = createRelay(createRegistry([subscriber]));
            const event = addThing('aggregate-1', [FIRST]);

            await relay.processBatch();

            expect(transactions.commits).toBe(0);
            expect(store.delivery(event.id, FIRST)).toMatchObject({ status: 'pending' });
            expect(metrics.processed).toEqual([]);
        });

        it('releases the rest of the batch when the lease would expire during the next handler', async () => {
            const subscriber = recordingSubscriber(FIRST, () => {
                clock.advance(LEASE_MS - HANDLER_TIMEOUT_MS);
                return Promise.resolve();
            });
            const relay = createRelay(createRegistry([subscriber]));
            const first = addThing('aggregate-1', [FIRST]);
            const second = addThing('aggregate-2', [FIRST]);

            expect(await relay.processBatch()).toBe(2);

            expect(subscriber.received.map((received) => received.id)).toEqual([first.id]);
            expect(store.delivery(first.id, FIRST)).toMatchObject({ status: 'done' });
            expect(store.delivery(second.id, FIRST)).toMatchObject({
                status: 'pending',
                attempts: 0,
            });
            expect(store.releaseClaim).toHaveBeenCalledTimes(1);
        });

        it('publishes the pending deliveries gauge', async () => {
            const relay = createRelay(
                createRegistry([
                    recordingSubscriber(FIRST),
                    recordingSubscriber(SECOND, failingTimes(1)),
                ]),
            );
            addThing('aggregate-1', [FIRST, SECOND]);

            await relay.processBatch();

            expect(Object.fromEntries(metrics.pendingSnapshots.at(-1) ?? new Map())).toEqual({
                [SECOND]: 1,
            });
        });

        it('refreshes the pending gauge after an empty batch only once the interval has passed', async () => {
            const relay = createRelay(createRegistry([recordingSubscriber(FIRST)]));
            addThing('aggregate-1', [FIRST]);
            await relay.processBatch();
            store.countPendingBySubscriber.mockClear();

            await relay.processBatch();
            clock.advance(PENDING_GAUGE_INTERVAL_MS - 1);
            await relay.processBatch();
            expect(store.countPendingBySubscriber).not.toHaveBeenCalled();

            clock.advance(1);
            await relay.processBatch();
            expect(store.countPendingBySubscriber).toHaveBeenCalledTimes(1);
            expect(Object.fromEntries(metrics.pendingSnapshots.at(-1) ?? new Map())).toEqual({});
        });

        it('refreshes the pending gauge at most once per interval under load', async () => {
            const relay = createRelay(createRegistry([recordingSubscriber(FIRST)]));
            addThing('aggregate-1', [FIRST]);
            await relay.processBatch();
            store.countPendingBySubscriber.mockClear();

            addThing('aggregate-2', [FIRST]);
            expect(await relay.processBatch()).toBe(1);
            expect(store.countPendingBySubscriber).not.toHaveBeenCalled();

            clock.advance(PENDING_GAUGE_INTERVAL_MS);
            addThing('aggregate-3', [FIRST]);
            await relay.processBatch();
            expect(store.countPendingBySubscriber).toHaveBeenCalledTimes(1);
        });
    });

    describe('subscriber decisions', () => {
        it('fails a delivery at once when the subscriber reports a permanent error', async () => {
            const failure = new PermanentDeliveryError('chat rejected the message');
            const rejecting = recordingSubscriber(FIRST, () => Promise.reject(failure));
            const relay = createRelay(createRegistry([rejecting]));
            const event = addThing('aggregate-1', [FIRST]);
            const error = vi.spyOn(logger, 'error');

            await relay.processBatch();
            clock.advance(RETRY_STEP_MS);
            await relay.processBatch();

            expect(rejecting.received).toHaveLength(1);
            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'failed',
                attempts: 1,
                lastError: 'chat rejected the message',
                processedAt: START,
            });
            expect(store.scheduleRetry).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalledWith(
                expect.objectContaining({ eventId: event.id, subscriber: FIRST, err: failure }),
                'Outbox delivery failed',
            );
            expect(metrics.processed).toEqual([{ subscriber: FIRST, result: 'failed' }]);
        });

        it('does not affect other subscribers of the event when one reports a permanent error', async () => {
            const rejecting = recordingSubscriber(FIRST, () =>
                Promise.reject(new PermanentDeliveryError('never deliverable')),
            );
            const healthy = recordingSubscriber(SECOND);
            const relay = createRelay(createRegistry([rejecting, healthy]));
            const event = addThing('aggregate-1', [FIRST, SECOND]);

            await relay.processBatch();

            expect(healthy.received.map((received) => received.id)).toEqual([event.id]);
            expect(store.delivery(event.id, FIRST)).toMatchObject({ status: 'failed' });
            expect(store.delivery(event.id, SECOND)).toMatchObject({ status: 'done' });
            expect(metrics.processed).toEqual([
                { subscriber: FIRST, result: 'failed' },
                { subscriber: SECOND, result: 'done' },
            ]);
        });

        it('waits for the pause asked by the subscriber when it is longer than the retry policy', async () => {
            const pausing = recordingSubscriber(
                FIRST,
                failingWith(new RetryLaterDeliveryError('slow down', 5 * SECOND_MS), 1),
            );
            const relay = createRelay(createRegistry([pausing]));
            const event = addThing('aggregate-1', [FIRST]);

            await relay.processBatch();

            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'pending',
                attempts: 1,
                nextAttemptAt: new Date(START.getTime() + 5 * SECOND_MS),
                lastError: 'slow down',
            });
            expect(metrics.processed).toEqual([{ subscriber: FIRST, result: 'retry' }]);
            clock.advance(5 * SECOND_MS - 1);
            expect(await relay.processBatch()).toBe(0);
            clock.advance(1);
            expect(await relay.processBatch()).toBe(1);
            expect(store.delivery(event.id, FIRST)).toMatchObject({ status: 'done' });
        });

        it('keeps the retry policy delay when it is longer than the pause asked by the subscriber', async () => {
            const longerSettings = new OutboxSettings({
                pollIntervalMs: POLL_INTERVAL_MS,
                batchSize: BATCH_SIZE,
                maxAttempts: 5,
                retentionDays: 7,
                claimLeaseMs: LEASE_MS,
                handlerTimeoutMs: HANDLER_TIMEOUT_MS,
                pendingGaugeIntervalMs: PENDING_GAUGE_INTERVAL_MS,
            });
            const pausing = recordingSubscriber(
                FIRST,
                failingWith(new RetryLaterDeliveryError('slow down', 5 * SECOND_MS), 3),
            );
            const relay = createRelay(createRegistry([pausing]), longerSettings);
            const event = addThing('aggregate-1', [FIRST]);

            await relay.processBatch();
            clock.advance(5 * SECOND_MS);
            await relay.processBatch();
            clock.advance(5 * SECOND_MS);
            const thirdAttemptAt = clock.now().getTime();
            await relay.processBatch();

            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'pending',
                attempts: 3,
                nextAttemptAt: new Date(thirdAttemptAt + 30 * SECOND_MS),
            });
        });

        it('counts the attempts with a pause towards the attempt limit', async () => {
            const pausing = recordingSubscriber(FIRST, () =>
                Promise.reject(new RetryLaterDeliveryError('slow down', SECOND_MS)),
            );
            const relay = createRelay(createRegistry([pausing]));
            const event = addThing('aggregate-1', [FIRST]);

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
                await relay.processBatch();
                clock.advance(RETRY_STEP_MS);
            }
            await relay.processBatch();

            expect(pausing.received).toHaveLength(MAX_ATTEMPTS);
            expect(store.delivery(event.id, FIRST)).toMatchObject({
                status: 'failed',
                attempts: MAX_ATTEMPTS,
                lastError: 'slow down',
            });
            expect(metrics.processed.map((entry) => entry.result)).toEqual([
                'retry',
                'retry',
                'failed',
            ]);
        });

        it.each([
            { decision: 'a permanent error', failure: new PermanentDeliveryError('rejected') },
            { decision: 'a pause', failure: new RetryLaterDeliveryError('slow down', SECOND_MS) },
        ])(
            'does not write $decision for a delivery whose lease was taken over',
            async ({ failure }) => {
                const subscriber = recordingSubscriber(FIRST, () => {
                    store.takeOverLease(event.id, FIRST);
                    return Promise.reject(failure);
                });
                const relay = createRelay(createRegistry([subscriber]));
                const event = addThing('aggregate-1', [FIRST]);

                await relay.processBatch();

                expect(store.delivery(event.id, FIRST)).toMatchObject({
                    status: 'pending',
                    lastError: null,
                });
                expect(metrics.processed).toEqual([]);
            },
        );
    });

    describe('cleanup', () => {
        it('deletes processed events older than the retention period', async () => {
            const relay = createRelay(createRegistry([recordingSubscriber(FIRST)]));
            const oldEvent = addThing('aggregate-old', [FIRST]);
            await relay.processBatch();
            clock.advance(8 * DAY_MS);
            const recentEvent = addThing('aggregate-recent', [FIRST]);
            await relay.processBatch();

            const deletedCount = await relay.cleanup();

            expect(deletedCount).toBe(1);
            expect(store.deleteProcessedBefore).toHaveBeenCalledWith(
                new Date(clock.now().getTime() - 7 * DAY_MS),
            );
            expect([...store.events.keys()]).toEqual([recentEvent.id]);
            expect(store.events.has(oldEvent.id)).toBe(false);
        });
    });

    describe('scheduling', () => {
        let relay: OutboxRelay | undefined;

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(async () => {
            await relay?.onModuleDestroy();
            relay = undefined;
            vi.useRealTimers();
        });

        it('polls on the configured interval after the application starts', async () => {
            const subscriber = recordingSubscriber(FIRST);
            relay = createRelay(createRegistry([subscriber]));
            relay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(0);
            expect(store.claimDueDeliveries).toHaveBeenCalledTimes(1);

            addThing('aggregate-1', [FIRST]);
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
            expect(subscriber.received).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(1);

            expect(subscriber.received).toHaveLength(1);
        });

        it('wake runs an extra cycle and coalesces repeated calls', async () => {
            const subscriber = recordingSubscriber(FIRST);
            relay = createRelay(createRegistry([subscriber]));
            relay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(0);
            store.claimDueDeliveries.mockClear();

            addThing('aggregate-1', [FIRST]);
            relay.wake();
            relay.wake();
            relay.wake();
            await vi.advanceTimersByTimeAsync(50);

            expect(subscriber.received).toHaveLength(1);
            expect(store.claimDueDeliveries).toHaveBeenCalledTimes(1);
        });

        it('runs another cycle right after the current one when woken during it', async () => {
            let releaseFirstDelivery: () => void = () => undefined;
            const firstDeliveryGate = new Promise<void>((resolve) => {
                releaseFirstDelivery = resolve;
            });
            let isFirstDelivery = true;
            const subscriber = recordingSubscriber(FIRST, async () => {
                if (!isFirstDelivery) return;
                isFirstDelivery = false;
                await firstDeliveryGate;
            });
            relay = createRelay(createRegistry([subscriber]));
            addThing('aggregate-1', [FIRST]);
            relay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(0);
            expect(subscriber.received).toHaveLength(1);

            addThing('aggregate-2', [FIRST]);
            relay.wake();
            releaseFirstDelivery();
            await vi.advanceTimersByTimeAsync(50);

            expect(subscriber.received).toHaveLength(2);
        });

        it('drains a full batch without waiting for the poll interval', async () => {
            const subscriber = recordingSubscriber(FIRST);
            relay = createRelay(createRegistry([subscriber]));
            for (let index = 0; index < BATCH_SIZE + 3; index += 1) {
                addThing(`aggregate-${String(index)}`, [FIRST]);
            }

            relay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(50);

            expect(subscriber.received).toHaveLength(BATCH_SIZE + 3);
        });

        it('cleans up on start and then once an hour', async () => {
            relay = createRelay(createRegistry([]));
            relay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(0);
            expect(store.deleteProcessedBefore).toHaveBeenCalledTimes(1);

            clock.advance(HOUR_MS - 1);
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
            expect(store.deleteProcessedBefore).toHaveBeenCalledTimes(1);

            clock.advance(1);
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
            expect(store.deleteProcessedBefore).toHaveBeenCalledTimes(2);
        });

        it('keeps polling after a failed cycle', async () => {
            const subscriber = recordingSubscriber(FIRST);
            relay = createRelay(createRegistry([subscriber]));
            const error = vi.spyOn(logger, 'error');
            const databaseDown = new Error('database is down');
            store.claimDueDeliveries.mockRejectedValueOnce(databaseDown);
            addThing('aggregate-1', [FIRST]);

            relay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(0);
            expect(error).toHaveBeenCalledWith(
                expect.objectContaining({ err: databaseDown }),
                'Outbox cycle failed',
            );
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

            expect(subscriber.received).toHaveLength(1);
        });

        it('stops on module destroy after the running cycle finishes', async () => {
            let releaseSubscriber: () => void = () => undefined;
            const subscriber = recordingSubscriber(
                FIRST,
                () =>
                    new Promise<void>((resolve) => {
                        releaseSubscriber = resolve;
                    }),
            );
            const stoppingRelay = createRelay(createRegistry([subscriber]));
            addThing('aggregate-1', [FIRST]);
            stoppingRelay.onApplicationBootstrap();
            await vi.advanceTimersByTimeAsync(0);

            let isStopped = false;
            const stopping = stoppingRelay.onModuleDestroy().then(() => {
                isStopped = true;
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(isStopped).toBe(false);
            releaseSubscriber();
            await stopping;
            store.claimDueDeliveries.mockClear();

            stoppingRelay.wake();
            await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MS);

            expect(isStopped).toBe(true);
            expect(store.claimDueDeliveries).not.toHaveBeenCalled();
        });

        it('ignores wake before the application starts', async () => {
            relay = createRelay(createRegistry([]));

            relay.wake();
            await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MS);

            expect(store.claimDueDeliveries).not.toHaveBeenCalled();
        });
    });
});

describe.skipIf(adminUrl === undefined)('OutboxRelay (integration)', () => {
    let database: OutboxTestDatabase;
    let pool: DatabasePool;
    let otherPool: DatabasePool;
    let runner: TransactionRunner;
    let otherRunner: TransactionRunner;

    class NoopWakeUp extends OutboxWakeUpPort {
        wake(): void {
            return undefined;
        }
    }

    function relayFor(
        registry: DomainEventRegistry,
        transactions: TransactionRunner,
        clock: FakeOutboxClock,
        metrics = new RecordingOutboxMetrics(),
    ): OutboxRelay {
        return new OutboxRelay(
            new OutboxStore(transactions, settings),
            registry,
            transactions,
            settings,
            clock,
            metrics,
            silentLogger(),
        );
    }

    async function publish(registry: DomainEventRegistry, events: DomainEvent[]): Promise<void> {
        const publisher = new OutboxDomainEventPublisher(
            runner,
            registry,
            new OutboxStore(runner, settings),
            new NoopWakeUp(),
        );
        await runner.run(() => publisher.publish(events));
    }

    function futureClock(): FakeOutboxClock {
        return new FakeOutboxClock(new Date(Date.now() + DAY_MS));
    }

    beforeAll(async () => {
        database = await createOutboxTestDatabase(adminUrl ?? '', 'outbox_relay');
        pool = await database.createPool();
        otherPool = await database.createPool();
        runner = new TransactionRunner(pool, silentLogger());
        otherRunner = new TransactionRunner(otherPool, silentLogger());
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await otherPool.end();
        await database.drop();
    });

    beforeEach(async () => {
        await truncateOutbox(pool);
    });

    it('a new relay instance processes an event written before a crash', async () => {
        const event = thingHappened('aggregate-1');
        await publish(createRegistry([recordingSubscriber(FIRST)]), [event]);

        const subscriber = recordingSubscriber(FIRST);
        const restartedRelay = relayFor(createRegistry([subscriber]), runner, futureClock());
        await restartedRelay.processBatch();

        expect(subscriber.received.map((received) => received.id)).toEqual([event.id]);
        expect(await readDelivery(pool, event.id, FIRST)).toMatchObject({ status: 'done' });
    });

    it('a new relay instance takes over a delivery claimed by a relay that crashed', async () => {
        const event = thingHappened('aggregate-1');
        await publish(createRegistry([recordingSubscriber(FIRST)]), [event]);
        const clock = futureClock();
        const crashedStore = new OutboxStore(otherRunner, settings);
        await crashedStore.claimDueDeliveries(BATCH_SIZE, clock.now(), [FIRST]);

        const subscriber = recordingSubscriber(FIRST);
        const restartedRelay = relayFor(createRegistry([subscriber]), runner, clock);
        expect(await restartedRelay.processBatch()).toBe(0);
        clock.advance(LEASE_MS);
        expect(await restartedRelay.processBatch()).toBe(1);

        expect(subscriber.received.map((received) => received.id)).toEqual([event.id]);
        expect(await readDelivery(pool, event.id, FIRST)).toMatchObject({
            status: 'done',
            attempts: 2,
        });
    });

    it.each([
        { outcome: 'succeeds', staleFailure: undefined },
        { outcome: 'fails', staleFailure: new Error('stale relay failed late') },
        {
            outcome: 'reports a permanent error',
            staleFailure: new PermanentDeliveryError('stale relay rejected late'),
        },
        {
            outcome: 'asks for a pause',
            staleFailure: new RetryLaterDeliveryError('stale relay paused late', DAY_MS),
        },
    ])(
        'a relay whose lease expired and then $outcome cannot overwrite the result of the relay that took over',
        async ({ staleFailure }) => {
            const event = thingHappened('aggregate-1');
            await publish(createRegistry([recordingSubscriber(FIRST)]), [event]);
            await pool.query(sql.unsafe`
                CREATE TABLE IF NOT EXISTS stale_side_effects (event_id uuid NOT NULL)`);
            await pool.query(sql.unsafe`TRUNCATE stale_side_effects`);
            const clock = futureClock();
            let releaseStale: () => void = () => undefined;
            const staleGate = new Promise<void>((resolve) => {
                releaseStale = resolve;
            });
            let markStaleStarted: () => void = () => undefined;
            const staleStarted = new Promise<void>((resolve) => {
                markStaleStarted = resolve;
            });
            const staleSubscriber = recordingSubscriber(FIRST, async (handled) => {
                markStaleStarted();
                await staleGate;
                await runner.executor().query(sql.unsafe`
                    INSERT INTO stale_side_effects (event_id) VALUES (${handled.id})`);
                if (staleFailure !== undefined) throw staleFailure;
            });
            const staleRelay = relayFor(createRegistry([staleSubscriber]), runner, clock);
            const currentSubscriber = recordingSubscriber(FIRST);
            const currentRelay = relayFor(createRegistry([currentSubscriber]), otherRunner, clock);

            const staleProcessing = staleRelay.processBatch();
            await staleStarted;
            clock.advance(LEASE_MS);
            expect(await currentRelay.processBatch()).toBe(1);
            releaseStale();
            await staleProcessing;

            expect(currentSubscriber.received.map((received) => received.id)).toEqual([event.id]);
            expect(await readDelivery(pool, event.id, FIRST)).toMatchObject({
                status: 'done',
                attempts: 2,
                last_error: null,
            });
            expect(
                await pool.anyFirst(sql.unsafe`SELECT event_id FROM stale_side_effects`),
            ).toEqual([]);
        },
    );

    it('two relays running in parallel never process one delivery twice', async () => {
        const events = Array.from({ length: 30 }, (_, index) =>
            thingHappened(`aggregate-${String(index)}`),
        );
        await publish(
            createRegistry([recordingSubscriber(FIRST), recordingSubscriber(SECOND)]),
            events,
        );
        const handledKeys: string[] = [];
        const slowSubscriber = (name: string): RecordingSubscriber =>
            recordingSubscriber(name, async (event) => {
                handledKeys.push(`${event.id}:${name}`);
                await new Promise((resolve) => setTimeout(resolve, 2));
            });
        const clock = futureClock();
        const firstRelay = relayFor(
            createRegistry([slowSubscriber(FIRST), slowSubscriber(SECOND)]),
            runner,
            clock,
        );
        const secondRelay = relayFor(
            createRegistry([slowSubscriber(FIRST), slowSubscriber(SECOND)]),
            otherRunner,
            clock,
        );

        const drain = async (relay: OutboxRelay): Promise<void> => {
            while ((await relay.processBatch()) > 0) {
                await Promise.resolve();
            }
        };
        await Promise.all([drain(firstRelay), drain(secondRelay)]);

        expect(handledKeys).toHaveLength(60);
        expect(new Set(handledKeys).size).toBe(60);
        const deliveries = await readDeliveries(pool);
        expect(deliveries.every((delivery) => delivery.status === 'done')).toBe(true);
    });

    it('retries only the failed subscriber against the real store', async () => {
        const event = thingHappened('aggregate-1');
        const healthy = recordingSubscriber(FIRST);
        const flaky = recordingSubscriber(SECOND, failingTimes(1));
        const registry = createRegistry([healthy, flaky]);
        await publish(registry, [event]);
        const clock = futureClock();
        const relay = relayFor(registry, runner, clock);

        await relay.processBatch();
        expect(await readDelivery(pool, event.id, SECOND)).toMatchObject({
            status: 'pending',
            attempts: 1,
            last_error: 'subscriber failed',
            next_attempt_at: clock.now().getTime() + SECOND_MS,
        });
        clock.advance(SECOND_MS);
        await relay.processBatch();

        expect(healthy.received).toHaveLength(1);
        expect(flaky.received).toHaveLength(2);
        expect(await readDelivery(pool, event.id, SECOND)).toMatchObject({ status: 'done' });
    });

    it('fails at once only the subscriber that reported a permanent error against the real store', async () => {
        const event = thingHappened('aggregate-1');
        const rejecting = recordingSubscriber(FIRST, () =>
            Promise.reject(new PermanentDeliveryError('never deliverable')),
        );
        const healthy = recordingSubscriber(SECOND);
        const registry = createRegistry([rejecting, healthy]);
        await publish(registry, [event]);
        const clock = futureClock();
        const metrics = new RecordingOutboxMetrics();
        const relay = relayFor(registry, runner, clock, metrics);

        await relay.processBatch();
        clock.advance(DAY_MS);
        await relay.processBatch();

        expect(rejecting.received).toHaveLength(1);
        expect(healthy.received).toHaveLength(1);
        expect(await readDelivery(pool, event.id, FIRST)).toMatchObject({
            status: 'failed',
            attempts: 1,
            last_error: 'never deliverable',
        });
        expect(await readDelivery(pool, event.id, SECOND)).toMatchObject({ status: 'done' });
        expect(metrics.processed).toContainEqual({ subscriber: FIRST, result: 'failed' });
    });

    it.each([
        {
            direction: 'the subscriber pause',
            retryAfterMs: 5 * SECOND_MS,
            expectedDelayMs: 5 * SECOND_MS,
        },
        { direction: 'the retry policy', retryAfterMs: SECOND_MS / 2, expectedDelayMs: SECOND_MS },
    ])(
        'schedules the next attempt by the later of the policy and the pause, here $direction, against the real store',
        async ({ retryAfterMs, expectedDelayMs }) => {
            const event = thingHappened('aggregate-1');
            const pausing = recordingSubscriber(
                FIRST,
                failingWith(new RetryLaterDeliveryError('slow down', retryAfterMs), 1),
            );
            const registry = createRegistry([pausing]);
            await publish(registry, [event]);
            const clock = futureClock();
            const relay = relayFor(registry, runner, clock);

            await relay.processBatch();

            expect(await readDelivery(pool, event.id, FIRST)).toMatchObject({
                status: 'pending',
                attempts: 1,
                last_error: 'slow down',
                next_attempt_at: clock.now().getTime() + expectedDelayMs,
            });
        },
    );

    it('cleanup removes old processed events', async () => {
        const oldEvent = thingHappened('aggregate-old');
        const registry = createRegistry([recordingSubscriber(FIRST)]);
        await publish(registry, [oldEvent]);
        const clock = futureClock();
        const relay = relayFor(registry, runner, clock);
        await relay.processBatch();
        await setEventCreatedAt(pool, oldEvent.id, new Date(clock.now().getTime() - 8 * DAY_MS));

        expect(await relay.cleanup()).toBe(1);
        expect(await readEventIds(pool)).toEqual([]);
    });

    it('updates the outbox metrics', async () => {
        const event = thingHappened('aggregate-1');
        const registry = createRegistry([
            recordingSubscriber(FIRST),
            recordingSubscriber(SECOND, failingTimes(1)),
        ]);
        await publish(registry, [event]);
        const metrics = new RecordingOutboxMetrics();
        const relay = relayFor(registry, runner, futureClock(), metrics);

        await relay.processBatch();

        expect(metrics.processed).toContainEqual({ subscriber: FIRST, result: 'done' });
        expect(metrics.lags.map((lag) => lag.subscriber)).toEqual([FIRST]);
        expect(metrics.lags[0]?.lagSeconds).toBeGreaterThan(0);
        expect(Object.fromEntries(metrics.pendingSnapshots.at(-1) ?? new Map())).toEqual({
            [SECOND]: 1,
        });
    });
});
