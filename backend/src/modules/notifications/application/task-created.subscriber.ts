import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import { BaseError } from '../../../shared/errors';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { TaskAssignedOnCreateRule } from '../domain/task-assigned-on-create.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';

export const TASK_ASSIGNED_ON_CREATE_SUBSCRIBER = 'notifications.task-assigned-on-create';

export class UnexpectedSourceEventError extends BaseError {
    readonly code = 'NOTIFICATIONS.UNEXPECTED_SOURCE_EVENT';
}

@Injectable()
export class TaskCreatedSubscriber implements EventSubscriber {
    readonly name = TASK_ASSIGNED_ON_CREATE_SUBSCRIBER;

    private readonly rule = new TaskAssignedOnCreateRule();

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
        if (!this.rule.appliesTo(event)) return;
        const actorLogin = await this.users.findLoginById(event.creatorId);
        if (actorLogin === null) throw new NotificationActorNotFoundError(event.creatorId);
        await this.createNotifications.execute(event.id, this.rule.apply(event, actorLogin));
    }
}
