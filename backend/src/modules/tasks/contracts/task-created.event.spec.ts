import { describe, expect, it } from 'vitest';
import {
    DomainEventRegistry,
    InvalidEventPayloadError,
} from '../../../shared/outbox/application/domain-event-registry';
import { registerTaskEvents } from './register-task-events';
import { TASK_CREATED_EVENT_TYPE, TaskCreatedEvent } from './task-created.event';

const metadata = { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'creator' };

function createdEvent(assigneeId: string | null): TaskCreatedEvent {
    return new TaskCreatedEvent({
        aggregateId: '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a',
        title: 'Подготовить КП',
        creatorId: 'creator',
        assigneeId,
        metadata,
    });
}

function registry(): DomainEventRegistry {
    const events = new DomainEventRegistry();
    registerTaskEvents(events);
    return events;
}

describe('TaskCreatedEvent contract', () => {
    it('has a stable versioned event type', () => {
        expect(TASK_CREATED_EVENT_TYPE).toBe('tasks.task_created');
    });

    it('exposes the task id as the aggregate id', () => {
        const event = createdEvent('assignee');

        expect(event.taskId).toBe(event.aggregateId);
    });

    it('serializes the task facts under its event type', () => {
        const serialized = registry().serialize(createdEvent('assignee'));

        expect(serialized.eventType).toBe(TASK_CREATED_EVENT_TYPE);
        expect(serialized.payload).toEqual({
            title: 'Подготовить КП',
            creatorId: 'creator',
            assigneeId: 'assignee',
        });
    });

    it('lists the subscribers registered for the event', () => {
        const events = registry();
        events.subscribe(TASK_CREATED_EVENT_TYPE, {
            name: 'testing.listener',
            handle: () => Promise.resolve(),
        });

        expect(events.serialize(createdEvent(null)).subscribers).toEqual(['testing.listener']);
    });

    it.each([['assignee'], [null]])('restores an equal event (assignee %s)', (assigneeId) => {
        const events = registry();
        const original = createdEvent(assigneeId);
        const serialized = events.serialize(original);

        const restored = events.restore({
            id: original.id,
            eventType: serialized.eventType,
            aggregateId: original.aggregateId,
            payload: JSON.parse(JSON.stringify(serialized.payload)),
            metadata: JSON.parse(JSON.stringify(original.metadata)),
        });

        expect(restored).toBeInstanceOf(TaskCreatedEvent);
        if (!(restored instanceof TaskCreatedEvent)) return;
        expect(restored.id).toBe(original.id);
        expect(restored.taskId).toBe(original.taskId);
        expect(restored.title).toBe('Подготовить КП');
        expect(restored.creatorId).toBe('creator');
        expect(restored.assigneeId).toBe(assigneeId);
        expect(restored.metadata).toEqual(original.metadata);
    });

    it.each([
        ['an empty title', { title: '', creatorId: 'creator', assigneeId: null }],
        ['a missing creator', { title: 'КП', assigneeId: null }],
        ['an undefined assignee', { title: 'КП', creatorId: 'creator' }],
        ['a numeric assignee', { title: 'КП', creatorId: 'creator', assigneeId: 7 }],
    ])('rejects a payload with %s', (_case, payload) => {
        expect(() =>
            registry().restore({
                id: 'e1',
                eventType: TASK_CREATED_EVENT_TYPE,
                aggregateId: 't1',
                payload,
                metadata,
            }),
        ).toThrow(InvalidEventPayloadError);
    });
});
