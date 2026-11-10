import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { sql, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { DomainEventPublisherPort } from '../../ddd';
import type { DomainEventRegistry } from '../application/domain-event-registry';
import { OutboxStorePort, type ClaimedDelivery } from '../application/outbox-store.port';
import { OutboxWakeUpPort } from '../application/outbox-wake-up.port';
import {
    createOutboxTestDatabase,
    createRegistry,
    readDelivery,
    readDeliveries,
    readEventIds,
    setDeliveryStatus,
    setEventCreatedAt,
    silentSubscriber,
    thingHappened,
    THING_HAPPENED,
    truncateOutbox,
    type OutboxTestDatabase,
} from '../testing/outbox-fixtures';
import {
    OutboxDomainEventPublisher,
    PublishOutsideTransactionError,
} from './outbox-domain-event-publisher';
import { OutboxSettings } from './outbox-settings';
import { OutboxStore } from './outbox-store';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const FIRST = 'testing.first';
const SECOND = 'testing.second';
const LEASE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

class RecordingWakeUp extends OutboxWakeUpPort {
    readonly wake = vi.fn<() => void>();
}

const silentLogger = (): PinoLogger => new PinoLogger({ pinoHttp: { level: 'silent' } });

const settings = new OutboxSettings({
    pollIntervalMs: 1000,
    batchSize: 50,
    maxAttempts: 10,
    retentionDays: 7,
    claimLeaseMs: LEASE_MS,
});

function farFuture(offsetMs = 0): Date {
    return new Date(Date.now() + DAY_MS + offsetMs);
}

function keysOf(claimed: readonly ClaimedDelivery[]): string[] {
    return claimed.map((delivery) => `${delivery.eventId}:${delivery.subscriber}`).sort();
}

describe.skipIf(adminUrl === undefined)('Outbox publisher and store', () => {
    let database: OutboxTestDatabase;
    let pool: DatabasePool;
    let otherPool: DatabasePool;
    let runner: TransactionRunner;
    let otherRunner: TransactionRunner;
    let registry: DomainEventRegistry;
    let store: OutboxStore;
    let otherStore: OutboxStore;
    let wakeUp: RecordingWakeUp;
    let publisher: OutboxDomainEventPublisher;

    async function publishCommitted(aggregateId: string, label = 'label'): Promise<string> {
        const event = thingHappened(aggregateId, label);
        await runner.run(() => publisher.publish([event]));
        return event.id;
    }

    beforeAll(async () => {
        database = await createOutboxTestDatabase(adminUrl ?? '', 'outbox_store');
        pool = await database.createPool();
        otherPool = await database.createPool();
        runner = new TransactionRunner(pool, silentLogger());
        otherRunner = new TransactionRunner(otherPool, silentLogger());
        registry = createRegistry([silentSubscriber(FIRST), silentSubscriber(SECOND)]);
        store = new OutboxStore(runner, settings);
        otherStore = new OutboxStore(otherRunner, settings);
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await otherPool.end();
        await database.drop();
    });

    beforeEach(async () => {
        await truncateOutbox(pool);
        wakeUp = new RecordingWakeUp();
        publisher = new OutboxDomainEventPublisher(runner, registry, store, wakeUp);
    });

    it('implements the ports', () => {
        expect(publisher).toBeInstanceOf(DomainEventPublisherPort);
        expect(store).toBeInstanceOf(OutboxStorePort);
    });

    describe('OutboxDomainEventPublisher', () => {
        it('writes the event and one delivery per subscriber inside the transaction', async () => {
            const event = thingHappened('aggregate-1', 'first label');

            await runner.run(() => publisher.publish([event]));

            expect(await readEventIds(pool)).toEqual([event.id]);
            const deliveries = await readDeliveries(pool);
            expect(deliveries.map((delivery) => delivery.subscriber).sort()).toEqual([
                FIRST,
                SECOND,
            ]);
            for (const delivery of deliveries) {
                expect(delivery).toMatchObject({
                    event_id: event.id,
                    status: 'pending',
                    attempts: 0,
                    last_error: null,
                    processed_at: null,
                });
            }
            const [claimed] = await store.claimDueDeliveries(1, farFuture());
            expect(claimed.event).toMatchObject({
                id: event.id,
                eventType: THING_HAPPENED,
                aggregateId: 'aggregate-1',
                payload: { label: 'first label' },
                metadata: {
                    timestamp: 1_700_000_000_000,
                    correlationId: 'corr-1',
                    userId: 'user-1',
                },
            });
            const restored = registry.restore(claimed.event);
            expect(restored).toMatchObject({ id: event.id, label: 'first label' });
        });

        it('leaves no events when the transaction rolls back', async () => {
            await expect(
                runner.run(async () => {
                    await publisher.publish([thingHappened('aggregate-1')]);
                    throw new Error('use case failed');
                }),
            ).rejects.toThrow('use case failed');

            expect(await readEventIds(pool)).toEqual([]);
            expect(await readDeliveries(pool)).toEqual([]);
            expect(wakeUp.wake).not.toHaveBeenCalled();
        });

        it('throws outside a transaction and stores nothing', async () => {
            await expect(publisher.publish([thingHappened('aggregate-1')])).rejects.toBeInstanceOf(
                PublishOutsideTransactionError,
            );

            expect(await readEventIds(pool)).toEqual([]);
        });

        it('wakes the relay only after the commit', async () => {
            let wakesBeforeCommit = -1;

            await runner.run(async () => {
                await publisher.publish([thingHappened('aggregate-1')]);
                await publisher.publish([thingHappened('aggregate-2')]);
                wakesBeforeCommit = wakeUp.wake.mock.calls.length;
            });

            expect(wakesBeforeCommit).toBe(0);
            expect(wakeUp.wake).toHaveBeenCalled();
        });

        it('writes nothing and does not wake the relay for an empty list', async () => {
            await runner.run(() => publisher.publish([]));

            expect(await readEventIds(pool)).toEqual([]);
            expect(wakeUp.wake).not.toHaveBeenCalled();
        });
    });

    describe('OutboxStore.claimDueDeliveries', () => {
        it('returns only pending deliveries whose next attempt is due', async () => {
            const dueId = await publishCommitted('aggregate-due');
            const laterId = await publishCommitted('aggregate-later');
            const doneId = await publishCommitted('aggregate-done');
            const failedId = await publishCommitted('aggregate-failed');
            await store.scheduleRetry(laterId, FIRST, 1, farFuture(DAY_MS), 'boom');
            await store.scheduleRetry(laterId, SECOND, 1, farFuture(DAY_MS), 'boom');
            await store.markDone(doneId, FIRST, new Date());
            await store.markDone(doneId, SECOND, new Date());
            await store.markFailed(failedId, FIRST, 10, 'boom', new Date());
            await store.markFailed(failedId, SECOND, 10, 'boom', new Date());

            const claimed = await store.claimDueDeliveries(50, farFuture());

            expect(keysOf(claimed)).toEqual([`${dueId}:${FIRST}`, `${dueId}:${SECOND}`].sort());
        });

        it('counts the claim as an attempt and leases the delivery', async () => {
            const eventId = await publishCommitted('aggregate-1');
            const now = farFuture();

            const claimed = await store.claimDueDeliveries(50, now);

            expect(claimed.map((delivery) => delivery.attempts)).toEqual([1, 1]);
            expect(await store.claimDueDeliveries(50, now)).toEqual([]);
            const leaseExpired = new Date(now.getTime() + LEASE_MS);
            const reclaimed = await store.claimDueDeliveries(50, leaseExpired);
            expect(keysOf(reclaimed)).toEqual([`${eventId}:${FIRST}`, `${eventId}:${SECOND}`]);
            expect(reclaimed.map((delivery) => delivery.attempts)).toEqual([2, 2]);
        });

        it('respects the limit and returns deliveries in creation order', async () => {
            const firstId = await publishCommitted('aggregate-1');
            const secondId = await publishCommitted('aggregate-2');
            await setEventCreatedAt(pool, firstId, new Date('2026-01-01T00:00:02Z'));
            await setEventCreatedAt(pool, secondId, new Date('2026-01-01T00:00:01Z'));

            const claimed = await store.claimDueDeliveries(2, farFuture());

            expect(claimed.map((delivery) => delivery.eventId)).toEqual([secondId, secondId]);
            expect(claimed[0]?.event.createdAt).toEqual(new Date('2026-01-01T00:00:01Z'));
        });

        it('does not hand out the same delivery to two concurrent connections', async () => {
            for (let index = 0; index < 6; index += 1) {
                await publishCommitted(`aggregate-${String(index)}`);
            }
            const now = farFuture();
            const claimFromOtherConnection = AsyncResource.bind(() =>
                otherStore.claimDueDeliveries(50, now),
            );
            let claimedByOther: ClaimedDelivery[] = [];

            const claimedInOpenTransaction = await runner.run(async () => {
                const claimed = await store.claimDueDeliveries(4, now);
                claimedByOther = await claimFromOtherConnection();
                return claimed;
            });
            const claimedAfterCommit = await otherStore.claimDueDeliveries(50, now);

            expect(claimedInOpenTransaction).toHaveLength(4);
            expect(claimedByOther).toHaveLength(8);
            expect(claimedAfterCommit).toEqual([]);
            const allKeys = [...keysOf(claimedInOpenTransaction), ...keysOf(claimedByOther)];
            expect(new Set(allKeys).size).toBe(12);
        });

        it('never claims a delivery twice when two connections race', async () => {
            for (let index = 0; index < 40; index += 1) {
                await publishCommitted(`aggregate-${String(index)}`);
            }
            const now = farFuture();
            const claimRounds = await Promise.all(
                Array.from({ length: 10 }, (_, round) =>
                    (round % 2 === 0 ? store : otherStore).claimDueDeliveries(10, now),
                ),
            );

            const remaining = await store.claimDueDeliveries(80, now);

            const allKeys = [...claimRounds, remaining].flatMap((claimed) => keysOf(claimed));
            expect(allKeys).toHaveLength(80);
            expect(new Set(allKeys).size).toBe(80);
        });

        it('does not hand out the next delivery of an aggregate until the previous one is closed', async () => {
            const firstId = await publishCommitted('aggregate-ordered', 'first');
            const secondId = await publishCommitted('aggregate-ordered', 'second');
            const otherId = await publishCommitted('aggregate-other');
            await setEventCreatedAt(pool, firstId, new Date('2026-01-01T00:00:01Z'));
            await setEventCreatedAt(pool, secondId, new Date('2026-01-01T00:00:02Z'));
            await setEventCreatedAt(pool, otherId, new Date('2026-01-01T00:00:03Z'));
            await setDeliveryStatus(pool, firstId, SECOND, 'done');
            await setDeliveryStatus(pool, secondId, SECOND, 'done');
            await setDeliveryStatus(pool, otherId, SECOND, 'done');
            const now = farFuture();

            const firstRound = await store.claimDueDeliveries(50, now);
            expect(keysOf(firstRound)).toEqual(
                [`${firstId}:${FIRST}`, `${otherId}:${FIRST}`].sort(),
            );

            await store.scheduleRetry(firstId, FIRST, 1, now, 'boom');
            const whileRetrying = await store.claimDueDeliveries(50, now);
            expect(keysOf(whileRetrying)).toEqual([`${firstId}:${FIRST}`]);

            await store.markDone(firstId, FIRST, now);
            const afterDone = await store.claimDueDeliveries(50, now);
            expect(keysOf(afterDone)).toEqual([`${secondId}:${FIRST}`]);
        });

        it('releases the next delivery of an aggregate once the previous one failed', async () => {
            const firstId = await publishCommitted('aggregate-ordered', 'first');
            const secondId = await publishCommitted('aggregate-ordered', 'second');
            await setEventCreatedAt(pool, firstId, new Date('2026-01-01T00:00:01Z'));
            await setEventCreatedAt(pool, secondId, new Date('2026-01-01T00:00:02Z'));
            await setDeliveryStatus(pool, firstId, SECOND, 'done');
            await setDeliveryStatus(pool, secondId, SECOND, 'done');
            const now = farFuture();

            await store.claimDueDeliveries(50, now);
            await store.markFailed(firstId, FIRST, 10, 'poison', new Date());
            const claimed = await store.claimDueDeliveries(50, now);

            expect(keysOf(claimed)).toEqual([`${secondId}:${FIRST}`]);
        });

        it('keeps the order of events published in one transaction', async () => {
            const first = thingHappened('aggregate-batch', 'first');
            const second = thingHappened('aggregate-batch', 'second');
            await runner.run(() => publisher.publish([first, second]));
            await setDeliveryStatus(pool, first.id, SECOND, 'done');
            await setDeliveryStatus(pool, second.id, SECOND, 'done');

            const claimed = await store.claimDueDeliveries(50, farFuture());

            expect(claimed.map((delivery) => delivery.eventId)).toEqual([first.id]);
        });
    });

    describe('OutboxStore state changes', () => {
        it('markDone closes the delivery and clears the error', async () => {
            const eventId = await publishCommitted('aggregate-1');
            const processedAt = new Date('2026-03-01T10:00:00Z');
            await store.scheduleRetry(eventId, FIRST, 1, new Date(), 'boom');

            await store.markDone(eventId, FIRST, processedAt);

            expect(await readDelivery(pool, eventId, FIRST)).toMatchObject({
                status: 'done',
                last_error: null,
                processed_at: processedAt.getTime(),
            });
            expect(await readDelivery(pool, eventId, SECOND)).toMatchObject({ status: 'pending' });
        });

        it('scheduleRetry keeps the delivery pending with the attempt, time and error', async () => {
            const eventId = await publishCommitted('aggregate-1');
            const nextAttemptAt = new Date('2026-03-01T10:00:05Z');

            await store.scheduleRetry(eventId, FIRST, 3, nextAttemptAt, 'subscriber failed');

            expect(await readDelivery(pool, eventId, FIRST)).toMatchObject({
                status: 'pending',
                attempts: 3,
                next_attempt_at: nextAttemptAt.getTime(),
                last_error: 'subscriber failed',
                processed_at: null,
            });
        });

        it('markFailed stops the delivery and keeps the last error', async () => {
            const eventId = await publishCommitted('aggregate-1');

            const processedAt = new Date('2026-03-01T10:00:07Z');

            await store.markFailed(eventId, FIRST, 10, 'gave up', processedAt);

            expect(await readDelivery(pool, eventId, FIRST)).toMatchObject({
                status: 'failed',
                attempts: 10,
                last_error: 'gave up',
                processed_at: processedAt.getTime(),
            });
        });

        it('stores long errors truncated', async () => {
            const eventId = await publishCommitted('aggregate-1');

            await store.markFailed(eventId, FIRST, 1, 'x'.repeat(10_000), new Date());

            const delivery = await readDelivery(pool, eventId, FIRST);
            expect(delivery?.last_error?.length).toBeLessThanOrEqual(2000);
        });

        it('deleteProcessedBefore removes only old fully processed events', async () => {
            const cutoff = new Date('2026-02-01T00:00:00Z');
            const oldDoneId = await publishCommitted('aggregate-old-done');
            const oldFailedId = await publishCommitted('aggregate-old-failed');
            const oldPendingId = await publishCommitted('aggregate-old-pending');
            const recentDoneId = await publishCommitted('aggregate-recent-done');
            for (const eventId of [oldDoneId, oldFailedId, oldPendingId]) {
                await setEventCreatedAt(pool, eventId, new Date('2026-01-01T00:00:00Z'));
            }
            await setEventCreatedAt(pool, recentDoneId, new Date('2026-02-02T00:00:00Z'));
            for (const eventId of [oldDoneId, oldFailedId, oldPendingId, recentDoneId]) {
                await store.markDone(eventId, FIRST, cutoff);
            }
            await store.markDone(oldDoneId, SECOND, cutoff);
            await store.markFailed(oldFailedId, SECOND, 10, 'gave up', new Date());
            await store.markDone(recentDoneId, SECOND, cutoff);

            const deletedCount = await store.deleteProcessedBefore(cutoff);

            expect(deletedCount).toBe(1);
            expect(await readEventIds(pool)).toEqual(
                [oldFailedId, oldPendingId, recentDoneId].sort(),
            );
            const deliveries = await readDeliveries(pool);
            expect(deliveries.some((delivery) => delivery.event_id === oldDoneId)).toBe(false);
        });

        it('countPendingBySubscriber counts pending deliveries per subscriber', async () => {
            const firstId = await publishCommitted('aggregate-1');
            await publishCommitted('aggregate-2');
            await store.markDone(firstId, FIRST, new Date());

            const pending = await store.countPendingBySubscriber();

            expect(Object.fromEntries(pending)).toEqual({ [FIRST]: 1, [SECOND]: 2 });
        });

        it('writes through the transaction executor', async () => {
            const eventId = await publishCommitted('aggregate-1');

            await expect(
                runner.run(async () => {
                    await store.markDone(eventId, FIRST, new Date());
                    throw new Error('rolled back');
                }),
            ).rejects.toThrow('rolled back');

            expect(await readDelivery(pool, eventId, FIRST)).toMatchObject({ status: 'pending' });
            const leftover = await pool.anyFirst(
                sql.unsafe`SELECT status FROM outbox_deliveries WHERE event_id = ${eventId}`,
            );
            expect(leftover).toEqual(['pending', 'pending']);
        });

        it('stores events with a generated id when published', async () => {
            const eventId = await publishCommitted(randomUUID());

            expect(await readEventIds(pool)).toEqual([eventId]);
        });
    });
});
