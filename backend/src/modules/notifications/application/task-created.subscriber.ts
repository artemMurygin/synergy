import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import { BaseError } from '../../../shared/errors';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { TaskAssignedOnCreateRule } from '../domain/task-assigned-on-create.rule';
import { TaskCreatedOnBehalfRule } from '../domain/task-created-on-behalf.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';

export const TASK_ASSIGNED_ON_CREATE_SUBSCRIBER = 'notifications.task-assigned-on-create';

export class UnexpectedSourceEventError extends BaseError {
    readonly code = 'NOTIFICATIONS.UNEXPECTED_SOURCE_EVENT';
}

/**
 * On a new task: `task.assigned` for the assignee and `task.created-on-behalf` for a creator the
 * task was set for by someone else. The name stays the historical one so that the outbox keeps
 * the delivery state of events recorded before the second notification appeared.
 */
@Injectable()
export class TaskCreatedSubscriber implements EventSubscriber {
    readonly name = TASK_ASSIGNED_ON_CREATE_SUBSCRIBER;

    private readonly assigned = new TaskAssignedOnCreateRule();

    private readonly onBehalf = new TaskCreatedOnBehalfRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof TaskCreatedEvent)) {
            throw new UnexpectedSourceEventError('Subscriber expects TaskCreatedEvent', undefined, {
                subscriber: this.name,
                eventClass: event.constructor.name,
            });
        }
        if (!this.assigned.appliesTo(event) && !this.onBehalf.appliesTo(event)) return;
        const initiatorLogin = await this.users.findLoginById(event.initiatorId);
        if (initiatorLogin === null) throw new NotificationActorNotFoundError(event.initiatorId);
        // One call: both notifications are stored in one transaction, a repeat inserts nothing.
        await this.createNotifications.execute(event.id, [
            ...this.assigned.apply(event, initiatorLogin),
            ...this.onBehalf.apply(event, initiatorLogin),
        ]);
    }
}
