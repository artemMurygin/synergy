import { randomUUID } from 'node:crypto';
import { RequestContext } from '../context/request-context';
import { ArgumentNotProvidedError } from '../errors';
import { Guard } from './guard';

interface DomainEventMetadata {
    readonly timestamp: number;
    readonly correlationId: string;
    readonly causationId?: string;
    readonly userId?: string;
}

export type DomainEventProps<T> = Omit<T, 'id' | 'metadata'> & {
    aggregateId: string;
    metadata?: DomainEventMetadata;
};

export abstract class DomainEvent {
    readonly id: string;

    readonly aggregateId: string;

    readonly metadata: DomainEventMetadata;

    constructor(props: DomainEventProps<unknown>) {
        if (Guard.isEmpty(props)) {
            throw new ArgumentNotProvidedError('DomainEvent props should not be empty');
        }
        this.id = randomUUID();
        this.aggregateId = props.aggregateId;
        this.metadata = {
            correlationId: props.metadata?.correlationId ?? RequestContext.getCorrelationId(),
            causationId: props.metadata?.causationId,
            timestamp: props.metadata?.timestamp ?? Date.now(),
            userId: props.metadata?.userId,
        };
    }
}
