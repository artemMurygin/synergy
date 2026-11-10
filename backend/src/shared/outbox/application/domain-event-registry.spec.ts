import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../ddd';
import {
    DomainEventRegistry,
    DuplicateEventTypeError,
    DuplicateSubscriberError,
    InvalidEventPayloadError,
    UnknownEventError,
    type EventSubscriber,
} from './domain-event-registry';

class SampleCreatedEvent extends DomainEvent {
    readonly title: string;

    readonly count: number;

    constructor(props: DomainEventProps<SampleCreatedEvent>) {
        super(props);
        this.title = props.title;
        this.count = props.count;
    }
}

class SampleArchivedEvent extends DomainEvent {
    readonly reason: string;

    constructor(props: DomainEventProps<SampleArchivedEvent>) {
        super(props);
        this.reason = props.reason;
    }
}

const SAMPLE_CREATED = 'samples.sample_created';
const SAMPLE_ARCHIVED = 'samples.sample_archived';

function registerSampleCreated(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: SAMPLE_CREATED,
        eventClass: SampleCreatedEvent,
        schema: z.object({ title: z.string().min(1), count: z.number().int() }),
        toPayload: (event) => ({ title: event.title, count: event.count }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new SampleCreatedEvent({ id, aggregateId, metadata, ...payload }),
    });
}

function subscriber(name: string): EventSubscriber {
    return { name, handle: () => Promise.resolve() };
}

function sampleEvent(): SampleCreatedEvent {
    return new SampleCreatedEvent({
        aggregateId: 'sample-1',
        title: 'First',
        count: 3,
        metadata: { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'user-1' },
    });
}

describe('DomainEventRegistry', () => {
    describe('registration', () => {
        it('registers an event type and its subscribers', () => {
            const registry = new DomainEventRegistry();
            const first = subscriber('samples.first');
            const second = subscriber('samples.second');

            registerSampleCreated(registry);
            registry.subscribe(SAMPLE_CREATED, first);
            registry.subscribe(SAMPLE_CREATED, second);

            expect(registry.findSubscriber(SAMPLE_CREATED, 'samples.first')).toBe(first);
            expect(registry.findSubscriber(SAMPLE_CREATED, 'samples.second')).toBe(second);
            expect(registry.findSubscriber(SAMPLE_CREATED, 'samples.unknown')).toBeUndefined();
        });

        it('accepts a subscriber before its event type is registered', () => {
            const registry = new DomainEventRegistry();

            registry.subscribe(SAMPLE_CREATED, subscriber('samples.early'));
            registerSampleCreated(registry);

            expect(registry.serialize(sampleEvent()).subscribers).toEqual(['samples.early']);
        });

        it('rejects a repeated event type', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(() => {
                registerSampleCreated(registry);
            }).toThrow(DuplicateEventTypeError);
        });

        it('rejects a second event type for the same event class', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(() => {
                registry.registerEvent({
                    eventType: 'samples.sample_created.v2',
                    eventClass: SampleCreatedEvent,
                    schema: z.object({}),
                    toPayload: () => ({}),
                    fromRecord: ({ id, aggregateId, metadata }) =>
                        new SampleCreatedEvent({ id, aggregateId, metadata, title: 't', count: 0 }),
                });
            }).toThrow(DuplicateEventTypeError);
        });

        it('rejects a repeated subscriber name', () => {
            const registry = new DomainEventRegistry();
            registry.subscribe(SAMPLE_CREATED, subscriber('samples.same'));

            expect(() => {
                registry.subscribe(SAMPLE_ARCHIVED, subscriber('samples.same'));
            }).toThrow(DuplicateSubscriberError);
        });
    });

    describe('serialize', () => {
        it('returns the event type, the payload and the subscriber names', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);
            registry.subscribe(SAMPLE_CREATED, subscriber('samples.first'));
            registry.subscribe(SAMPLE_CREATED, subscriber('samples.second'));

            expect(registry.serialize(sampleEvent())).toEqual({
                eventType: SAMPLE_CREATED,
                payload: { title: 'First', count: 3 },
                subscribers: ['samples.first', 'samples.second'],
            });
        });

        it('returns no subscribers for an event nobody listens to', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(registry.serialize(sampleEvent()).subscribers).toEqual([]);
        });

        it('throws UnknownEventError for an unregistered event', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(() =>
                registry.serialize(
                    new SampleArchivedEvent({ aggregateId: 'sample-1', reason: 'old' }),
                ),
            ).toThrow(UnknownEventError);
        });

        it('throws InvalidEventPayloadError when the payload breaks the schema', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);
            const event = new SampleCreatedEvent({ aggregateId: 'sample-1', title: '', count: 1 });

            expect(() => registry.serialize(event)).toThrow(InvalidEventPayloadError);
        });
    });

    describe('restore', () => {
        it('restores the event with its original id and metadata', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);
            const original = sampleEvent();
            const { eventType, payload } = registry.serialize(original);

            const restored = registry.restore({
                id: original.id,
                eventType,
                aggregateId: original.aggregateId,
                payload: JSON.parse(JSON.stringify(payload)),
                metadata: JSON.parse(JSON.stringify(original.metadata)),
            });

            expect(restored).toBeInstanceOf(SampleCreatedEvent);
            expect(restored.id).toBe(original.id);
            expect(restored.aggregateId).toBe('sample-1');
            expect(restored.metadata).toEqual(original.metadata);
            expect(restored).toMatchObject({ title: 'First', count: 3 });
        });

        it('throws UnknownEventError for an unknown event type', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(() =>
                registry.restore({
                    id: 'event-1',
                    eventType: 'samples.unknown',
                    aggregateId: 'sample-1',
                    payload: {},
                    metadata: { timestamp: 1, correlationId: 'corr-1' },
                }),
            ).toThrow(UnknownEventError);
        });

        it('throws InvalidEventPayloadError when the payload breaks the schema', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(() =>
                registry.restore({
                    id: 'event-1',
                    eventType: SAMPLE_CREATED,
                    aggregateId: 'sample-1',
                    payload: { title: 'First', count: 'three' },
                    metadata: { timestamp: 1, correlationId: 'corr-1' },
                }),
            ).toThrow(InvalidEventPayloadError);
        });

        it('throws InvalidEventPayloadError when the metadata is malformed', () => {
            const registry = new DomainEventRegistry();
            registerSampleCreated(registry);

            expect(() =>
                registry.restore({
                    id: 'event-1',
                    eventType: SAMPLE_CREATED,
                    aggregateId: 'sample-1',
                    payload: { title: 'First', count: 3 },
                    metadata: { correlationId: 42 },
                }),
            ).toThrow(InvalidEventPayloadError);
        });
    });

    it('contains no type assertions in the registry source', () => {
        const source = readFileSync(join(__dirname, 'domain-event-registry.ts'), 'utf8');
        const code = source
            .split('\n')
            .filter((line) => !line.trimStart().startsWith('import '))
            .join('\n');

        expect(code).not.toMatch(/\bas\s+[\w{[(]/);
        expect(code).not.toMatch(/(?:[=(,:]|return)\s*<\w+>\s*[\w(]/);
        expect(code).not.toMatch(/\w!\./);
    });
});
