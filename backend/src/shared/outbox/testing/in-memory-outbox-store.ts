import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import {
    OutboxStorePort,
    type ClaimedDelivery,
    type DeliveryLease,
    type NewOutboxEvent,
    type StoredOutboxEvent,
} from '../application/outbox-store.port';
import { OutboxClockPort } from '../application/outbox-clock.port';
import { OutboxMetricsPort, type OutboxDeliveryResult } from '../application/outbox-metrics.port';

const DEFAULT_LEASE_MS = 60_000;

export interface InMemoryDelivery {
    readonly eventId: string;
    readonly subscriber: string;
    status: 'pending' | 'done' | 'failed';
    attempts: number;
    nextAttemptAt: Date;
    lastError: string | null;
    processedAt: Date | null;
    claimToken: string | null;
}

export class InMemoryOutboxStore extends OutboxStorePort {
    readonly events = new Map<string, StoredOutboxEvent>();

    readonly deliveries: InMemoryDelivery[] = [];

    constructor(
        private readonly clock: OutboxClockPort,
        private readonly leaseMs = DEFAULT_LEASE_MS,
    ) {
        super();
    }

    addEvent(event: Omit<StoredOutboxEvent, 'createdAt'>, subscribers: readonly string[]): void {
        const createdAt = this.clock.now();
        this.events.set(event.id, { ...event, createdAt });
        for (const subscriber of subscribers) {
            this.deliveries.push({
                eventId: event.id,
                subscriber,
                status: 'pending',
                attempts: 0,
                nextAttemptAt: createdAt,
                lastError: null,
                processedAt: null,
                claimToken: null,
            });
        }
    }

    delivery(eventId: string, subscriber: string): InMemoryDelivery | undefined {
        return this.deliveries.find(
            (delivery) => delivery.eventId === eventId && delivery.subscriber === subscriber,
        );
    }

    insertEvents = vi.fn((events: readonly NewOutboxEvent[]): Promise<void> => {
        for (const event of events) this.addEvent(event, event.subscribers);
        return Promise.resolve();
    });

    takeOverLease(eventId: string, subscriber: string): void {
        const delivery = this.delivery(eventId, subscriber);
        if (delivery !== undefined) delivery.claimToken = randomUUID();
    }

    claimDueDeliveries = vi.fn(
        (limit: number, now: Date, subscribers: readonly string[]): Promise<ClaimedDelivery[]> => {
            const claimed: ClaimedDelivery[] = [];
            const claimToken = randomUUID();
            for (const delivery of this.deliveries) {
                if (claimed.length >= limit) break;
                if (!subscribers.includes(delivery.subscriber)) continue;
                if (delivery.status !== 'pending' || delivery.nextAttemptAt > now) continue;
                const event = this.events.get(delivery.eventId);
                if (event === undefined || this.hasEarlierPending(delivery, event)) continue;
                delivery.attempts += 1;
                delivery.nextAttemptAt = new Date(now.getTime() + this.leaseMs);
                delivery.claimToken = claimToken;
                claimed.push({
                    eventId: delivery.eventId,
                    subscriber: delivery.subscriber,
                    claimToken,
                    attempts: delivery.attempts,
                    event,
                });
            }
            return Promise.resolve(claimed);
        },
    );

    markDone = vi.fn((lease: DeliveryLease, processedAt: Date): Promise<boolean> => {
        const delivery = this.leased(lease);
        if (delivery === undefined) return Promise.resolve(false);
        delivery.status = 'done';
        delivery.lastError = null;
        delivery.processedAt = processedAt;
        delivery.claimToken = null;
        return Promise.resolve(true);
    });

    scheduleRetry = vi.fn(
        (
            lease: DeliveryLease,
            attempt: number,
            nextAttemptAt: Date,
            error: string,
        ): Promise<boolean> => {
            const delivery = this.leased(lease);
            if (delivery === undefined) return Promise.resolve(false);
            delivery.attempts = attempt;
            delivery.nextAttemptAt = nextAttemptAt;
            delivery.lastError = error;
            delivery.claimToken = null;
            return Promise.resolve(true);
        },
    );

    markFailed = vi.fn(
        (
            lease: DeliveryLease,
            attempts: number,
            error: string,
            processedAt: Date,
        ): Promise<boolean> => {
            const delivery = this.leased(lease);
            if (delivery === undefined) return Promise.resolve(false);
            delivery.status = 'failed';
            delivery.attempts = attempts;
            delivery.lastError = error;
            delivery.processedAt = processedAt;
            delivery.claimToken = null;
            return Promise.resolve(true);
        },
    );

    releaseClaim = vi.fn((lease: DeliveryLease): Promise<boolean> => {
        const delivery = this.leased(lease);
        if (delivery === undefined) return Promise.resolve(false);
        delivery.attempts -= 1;
        delivery.nextAttemptAt = new Date(delivery.nextAttemptAt.getTime() - this.leaseMs);
        delivery.claimToken = null;
        return Promise.resolve(true);
    });

    deleteProcessedBefore = vi.fn((before: Date): Promise<number> => {
        let deletedCount = 0;
        for (const [eventId, event] of this.events) {
            const deliveries = this.deliveries.filter((delivery) => delivery.eventId === eventId);
            const isProcessed = deliveries.every((delivery) => delivery.status === 'done');
            if (event.createdAt < before && isProcessed) {
                this.events.delete(eventId);
                deletedCount += 1;
            }
        }
        return Promise.resolve(deletedCount);
    });

    countPendingBySubscriber = vi.fn((): Promise<ReadonlyMap<string, number>> => {
        const pendingBySubscriber = new Map<string, number>();
        for (const delivery of this.deliveries) {
            if (delivery.status !== 'pending') continue;
            pendingBySubscriber.set(
                delivery.subscriber,
                (pendingBySubscriber.get(delivery.subscriber) ?? 0) + 1,
            );
        }
        return Promise.resolve(pendingBySubscriber);
    });

    private leased(lease: DeliveryLease): InMemoryDelivery | undefined {
        const delivery = this.delivery(lease.eventId, lease.subscriber);
        return delivery?.claimToken === lease.claimToken ? delivery : undefined;
    }

    private hasEarlierPending(delivery: InMemoryDelivery, event: StoredOutboxEvent): boolean {
        return this.deliveries.some((other) => {
            if (other === delivery || other.subscriber !== delivery.subscriber) return false;
            if (other.status !== 'pending') return false;
            const otherEvent = this.events.get(other.eventId);
            return (
                otherEvent?.aggregateId === event.aggregateId &&
                otherEvent.createdAt < event.createdAt
            );
        });
    }
}

export class FakeOutboxClock extends OutboxClockPort {
    constructor(private current: Date) {
        super();
    }

    now(): Date {
        return new Date(this.current.getTime());
    }

    advance(durationMs: number): void {
        this.current = new Date(this.current.getTime() + durationMs);
    }
}

export class RecordingOutboxMetrics extends OutboxMetricsPort {
    readonly processed: { subscriber: string; result: OutboxDeliveryResult }[] = [];

    readonly lags: { subscriber: string; lagSeconds: number }[] = [];

    readonly pendingSnapshots: ReadonlyMap<string, number>[] = [];

    recordProcessed(subscriber: string, result: OutboxDeliveryResult): void {
        this.processed.push({ subscriber, result });
    }

    observeDeliveryLag(subscriber: string, lagSeconds: number): void {
        this.lags.push({ subscriber, lagSeconds });
    }

    setPendingDeliveries(pendingBySubscriber: ReadonlyMap<string, number>): void {
        this.pendingSnapshots.push(new Map(pendingBySubscriber));
    }
}
