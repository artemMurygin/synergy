import type { DomainEventMetadata } from '../../ddd';
import type { OutboxEventRecord } from './domain-event-registry';

export interface NewOutboxEvent {
    readonly id: string;
    readonly eventType: string;
    readonly aggregateId: string;
    readonly payload: unknown;
    readonly metadata: DomainEventMetadata;
    readonly subscribers: readonly string[];
}

export interface StoredOutboxEvent extends OutboxEventRecord {
    readonly createdAt: Date;
}

export interface ClaimedDelivery {
    readonly eventId: string;
    readonly subscriber: string;
    readonly attempts: number;
    readonly event: StoredOutboxEvent;
}

export abstract class OutboxStorePort {
    abstract insertEvents(events: readonly NewOutboxEvent[]): Promise<void>;

    abstract claimDueDeliveries(limit: number, now: Date): Promise<ClaimedDelivery[]>;

    abstract markDone(eventId: string, subscriber: string, processedAt: Date): Promise<void>;

    abstract scheduleRetry(
        eventId: string,
        subscriber: string,
        attempt: number,
        nextAttemptAt: Date,
        error: string,
    ): Promise<void>;

    abstract markFailed(
        eventId: string,
        subscriber: string,
        attempts: number,
        error: string,
    ): Promise<void>;

    abstract deleteProcessedBefore(before: Date): Promise<number>;

    abstract countPendingBySubscriber(): Promise<ReadonlyMap<string, number>>;
}
