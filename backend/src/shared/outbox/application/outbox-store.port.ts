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

export interface DeliveryLease {
    readonly eventId: string;
    readonly subscriber: string;
    readonly claimToken: string;
}

export interface ClaimedDelivery extends DeliveryLease {
    readonly attempts: number;
    readonly event: StoredOutboxEvent;
}

export abstract class OutboxStorePort {
    abstract insertEvents(events: readonly NewOutboxEvent[]): Promise<void>;

    abstract claimDueDeliveries(
        limit: number,
        now: Date,
        subscribers: readonly string[],
    ): Promise<ClaimedDelivery[]>;

    abstract markDone(lease: DeliveryLease, processedAt: Date): Promise<boolean>;

    abstract scheduleRetry(
        lease: DeliveryLease,
        attempt: number,
        nextAttemptAt: Date,
        error: string,
    ): Promise<boolean>;

    abstract markFailed(
        lease: DeliveryLease,
        attempts: number,
        error: string,
        processedAt: Date,
    ): Promise<boolean>;

    abstract releaseClaim(lease: DeliveryLease): Promise<boolean>;

    abstract deleteProcessedBefore(before: Date): Promise<number>;

    abstract countPendingBySubscriber(): Promise<ReadonlyMap<string, number>>;
}
