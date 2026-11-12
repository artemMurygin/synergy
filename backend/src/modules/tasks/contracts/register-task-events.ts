import type { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import {
    TASK_CREATED_EVENT_TYPE,
    TaskCreatedEvent,
    taskCreatedPayloadSchema,
    type TaskCreatedPayload,
} from './task-created.event';

export function registerTaskEvents(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: TASK_CREATED_EVENT_TYPE,
        eventClass: TaskCreatedEvent,
        schema: taskCreatedPayloadSchema,
        toPayload: (event): TaskCreatedPayload => ({
            title: event.title,
            creatorId: event.creatorId,
            initiatorId: event.initiatorId,
            assigneeId: event.assigneeId,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new TaskCreatedEvent({ id, aggregateId, metadata, ...payload }),
    });
}
