import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { BugReportedEvent } from '../../portal/contracts/bug-reported.event';
import { BugReportedRule } from '../domain/bug-reported.rule';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const BUG_REPORTED_SUBSCRIBER = 'notifications.bug-reported';

/** On a new bug: `bug.reported` for every active developer except the author. */
@Injectable()
export class BugReportedSubscriber implements EventSubscriber {
    readonly name = BUG_REPORTED_SUBSCRIBER;

    private readonly rule = new BugReportedRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof BugReportedEvent)) {
            throw new UnexpectedSourceEventError('Subscriber expects BugReportedEvent', undefined, {
                subscriber: this.name,
                eventClass: event.constructor.name,
            });
        }
        const authorName = await this.users.findFullNameById(event.authorId);
        if (authorName === null) throw new NotificationActorNotFoundError(event.authorId);
        const developerIds = await this.users.listActiveDeveloperIds();
        const drafts = this.rule.apply(event, authorName, developerIds);
        if (drafts.length === 0) return;
        await this.createNotifications.execute(event.id, drafts);
    }
}
