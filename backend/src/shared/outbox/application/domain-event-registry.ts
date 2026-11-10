import { z } from 'zod';
import type { DomainEvent, DomainEventMetadata } from '../../ddd';
import { BaseError } from '../../errors';

export const UNKNOWN_EVENT = 'OUTBOX.UNKNOWN_EVENT';
export const INVALID_EVENT_PAYLOAD = 'OUTBOX.INVALID_EVENT_PAYLOAD';
export const DUPLICATE_EVENT_TYPE = 'OUTBOX.DUPLICATE_EVENT_TYPE';
export const DUPLICATE_SUBSCRIBER = 'OUTBOX.DUPLICATE_SUBSCRIBER';

export class UnknownEventError extends BaseError {
    readonly code: string = UNKNOWN_EVENT;
}

export class InvalidEventPayloadError extends BaseError {
    readonly code: string = INVALID_EVENT_PAYLOAD;
}

export class DuplicateEventTypeError extends BaseError {
    readonly code: string = DUPLICATE_EVENT_TYPE;
}

export class DuplicateSubscriberError extends BaseError {
    readonly code: string = DUPLICATE_SUBSCRIBER;
}

export interface OutboxEventRecord {
    readonly id: string;
    readonly eventType: string;
    readonly aggregateId: string;
    readonly payload: unknown;
    readonly metadata: unknown;
}

export interface RestoredEventRecord<TPayload> {
    readonly id: string;
    readonly aggregateId: string;
    readonly metadata: DomainEventMetadata;
    readonly payload: TPayload;
}

export interface EventRegistration<TEvent extends DomainEvent, TPayload> {
    readonly eventType: string;
    readonly eventClass: abstract new (...args: never[]) => TEvent;
    readonly schema: z.ZodType<TPayload>;
    readonly toPayload: (event: TEvent) => TPayload;
    readonly fromRecord: (record: RestoredEventRecord<TPayload>) => TEvent;
}

export interface EventSubscriber {
    readonly name: string;
    handle(event: DomainEvent): Promise<void>;
}

export interface SerializedEvent {
    readonly eventType: string;
    readonly payload: unknown;
    readonly subscribers: string[];
}

interface RegisteredEventType {
    readonly eventType: string;
    readonly toPayload: (event: DomainEvent) => unknown;
    readonly restore: (record: OutboxEventRecord) => DomainEvent;
}

const metadataSchema = z.object({
    timestamp: z.number(),
    correlationId: z.string(),
    causationId: z.string().optional(),
    userId: z.string().optional(),
});

export class DomainEventRegistry {
    private readonly eventTypeByName = new Map<string, RegisteredEventType>();

    private readonly eventTypeByClass = new Map<unknown, RegisteredEventType>();

    private readonly subscribersByEventType = new Map<string, EventSubscriber[]>();

    private readonly subscriberNames = new Set<string>();

    registerEvent<TEvent extends DomainEvent, TPayload>(
        registration: EventRegistration<TEvent, TPayload>,
    ): void {
        const { eventType, eventClass, schema } = registration;
        if (this.eventTypeByName.has(eventType) || this.eventTypeByClass.has(eventClass)) {
            throw new DuplicateEventTypeError('Event type is already registered', undefined, {
                eventType,
            });
        }
        const registered: RegisteredEventType = {
            eventType,
            toPayload: (event) => {
                if (!(event instanceof eventClass)) {
                    throw new UnknownEventError(
                        'Event does not match its registration',
                        undefined,
                        {
                            eventType,
                        },
                    );
                }
                return parsePayload(schema, registration.toPayload(event), eventType);
            },
            restore: (record) =>
                registration.fromRecord({
                    id: record.id,
                    aggregateId: record.aggregateId,
                    metadata: parseMetadata(record.metadata, eventType),
                    payload: parsePayload(schema, record.payload, eventType),
                }),
        };
        this.eventTypeByName.set(eventType, registered);
        this.eventTypeByClass.set(eventClass, registered);
    }

    subscribe(eventType: string, subscriber: EventSubscriber): void {
        if (this.subscriberNames.has(subscriber.name)) {
            throw new DuplicateSubscriberError('Subscriber name is already taken', undefined, {
                subscriber: subscriber.name,
            });
        }
        this.subscriberNames.add(subscriber.name);
        const subscribers = this.subscribersByEventType.get(eventType) ?? [];
        this.subscribersByEventType.set(eventType, [...subscribers, subscriber]);
    }

    registeredSubscriberNames(): readonly string[] {
        return [...this.subscriberNames];
    }

    findSubscriber(eventType: string, subscriberName: string): EventSubscriber | undefined {
        return this.subscribersByEventType
            .get(eventType)
            ?.find((subscriber) => subscriber.name === subscriberName);
    }

    serialize(event: DomainEvent): SerializedEvent {
        const registered = this.eventTypeByClass.get(event.constructor);
        if (registered === undefined) {
            throw new UnknownEventError('Event class is not registered', undefined, {
                eventClass: event.constructor.name,
            });
        }
        const subscribers = this.subscribersByEventType.get(registered.eventType) ?? [];
        return {
            eventType: registered.eventType,
            payload: registered.toPayload(event),
            subscribers: subscribers.map((subscriber) => subscriber.name),
        };
    }

    restore(record: OutboxEventRecord): DomainEvent {
        const registered = this.eventTypeByName.get(record.eventType);
        if (registered === undefined) {
            throw new UnknownEventError('Event type is not registered', undefined, {
                eventType: record.eventType,
            });
        }
        return registered.restore(record);
    }
}

function parsePayload<TPayload>(
    schema: z.ZodType<TPayload>,
    payload: unknown,
    eventType: string,
): TPayload {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        throw new InvalidEventPayloadError('Event payload does not match its schema', undefined, {
            eventType,
            issues: parsed.error.issues,
        });
    }
    return parsed.data;
}

function parseMetadata(metadata: unknown, eventType: string): DomainEventMetadata {
    const parsed = metadataSchema.safeParse(metadata);
    if (!parsed.success) {
        throw new InvalidEventPayloadError('Event metadata is malformed', undefined, {
            eventType,
            issues: parsed.error.issues,
        });
    }
    return parsed.data;
}
