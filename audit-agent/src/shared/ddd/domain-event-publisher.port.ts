import type { DomainEvent } from './domain-event.base';

export abstract class DomainEventPublisher {
    abstract publish(events: readonly DomainEvent[]): Promise<void>;
}
