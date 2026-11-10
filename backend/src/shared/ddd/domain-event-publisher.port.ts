import type { DomainEvent } from './domain-event.base';

export abstract class DomainEventPublisherPort {
    abstract publish(events: readonly DomainEvent[]): Promise<void>;
}
