import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { BugStatusChangedEvent } from '../../portal/contracts/bug-status-changed.event';
import { BugStatusChangedRule } from '../domain/bug-status-changed.rule';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const BUG_STATUS_CHANGED_SUBSCRIBER = 'notifications.bug-status-changed';

/** On a bug status change: `bug.status-changed` for the author of the bug. */
@Injectable()
export class BugStatusChangedSubscriber implements EventSubscriber {
    readonly name = BUG_STATUS_CHANGED_SUBSCRIBER;

    private readonly rule = new BugStatusChangedRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof BugStatusChangedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects BugStatusChangedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        const developerName = await this.users.findFullNameById(event.changedBy);
        if (developerName === null) throw new NotificationActorNotFoundError(event.changedBy);
        const drafts = this.rule.apply(event, developerName);
        if (drafts.length === 0) return;
        await this.createNotifications.execute(event.id, drafts);
    }
}
