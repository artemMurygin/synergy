import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../ddd';
import { BaseError } from '../../errors';
import { DomainEventRegistry } from '../application/domain-event-registry';
import { OutboxStorePort, type NewOutboxEvent } from '../application/outbox-store.port';
import { OutboxWakeUpPort } from '../application/outbox-wake-up.port';

export const PUBLISH_OUTSIDE_TRANSACTION = 'OUTBOX.PUBLISH_OUTSIDE_TRANSACTION';

export class PublishOutsideTransactionError extends BaseError {
    readonly code: string = PUBLISH_OUTSIDE_TRANSACTION;
}

@Injectable()
export class OutboxDomainEventPublisher extends DomainEventPublisherPort {
    constructor(
        private readonly transactions: TransactionRunnerPort,
        private readonly registry: DomainEventRegistry,
        private readonly store: OutboxStorePort,
        private readonly wakeUp: OutboxWakeUpPort,
    ) {
        super();
    }

    async publish(events: readonly DomainEvent[]): Promise<void> {
        if (!this.transactions.isInTransaction()) {
            throw new PublishOutsideTransactionError(
                'Domain events must be published inside a transaction',
            );
        }
        if (events.length === 0) return;
        const records = events.map((event): NewOutboxEvent => {
            const serialized = this.registry.serialize(event);
            return {
                id: event.id,
                eventType: serialized.eventType,
                aggregateId: event.aggregateId,
                payload: serialized.payload,
                metadata: event.metadata,
                subscribers: serialized.subscribers,
            };
        });
        await this.store.insertEvents(records);
        this.transactions.afterCommit(() => {
            this.wakeUp.wake();
        });
    }
}
