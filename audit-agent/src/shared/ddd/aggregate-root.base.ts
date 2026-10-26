import type { DomainEvent } from './domain-event.base';
import { Entity } from './entity.base';

export abstract class AggregateRoot<TProps extends object> extends Entity<TProps> {
    private domainEvents: DomainEvent[] = [];

    pullDomainEvents(): DomainEvent[] {
        const pulledEvents = this.domainEvents;
        this.domainEvents = [];
        return pulledEvents;
    }

    protected addEvent(domainEvent: DomainEvent): void {
        this.domainEvents.push(domainEvent);
    }
}
