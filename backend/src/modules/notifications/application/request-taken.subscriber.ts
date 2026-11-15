import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { RequestTakenEvent } from '../../portal/contracts/request-taken.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { RequestTakenRule } from '../domain/request-taken.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const REQUEST_TAKEN_SUBSCRIBER = 'notifications.request-taken';

/** On taking a request into work: `request.under-review` for the author. */
@Injectable()
export class RequestTakenSubscriber implements EventSubscriber {
    readonly name = REQUEST_TAKEN_SUBSCRIBER;

    private readonly rule = new RequestTakenRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof RequestTakenEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects RequestTakenEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        if (!this.rule.appliesTo(event)) return;
        const reviewerName = await this.users.findFullNameById(event.reviewerId);
        if (reviewerName === null) throw new NotificationActorNotFoundError(event.reviewerId);
        await this.createNotifications.execute(event.id, this.rule.apply(event, reviewerName));
    }
}
