export type OutboxDeliveryResult = 'done' | 'retry' | 'failed';

export abstract class OutboxMetricsPort {
    abstract recordProcessed(subscriber: string, result: OutboxDeliveryResult): void;

    abstract observeDeliveryLag(subscriber: string, lagSeconds: number): void;

    abstract setPendingDeliveries(pendingBySubscriber: ReadonlyMap<string, number>): void;
}
