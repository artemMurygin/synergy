import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { RequestAcceptedEvent } from '../../portal/contracts/request-accepted.event';
import { RequestRejectedEvent } from '../../portal/contracts/request-rejected.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { RequestDecisionRule } from '../domain/request-decision.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const REQUEST_ACCEPTED_SUBSCRIBER = 'notifications.request-accepted';
export const REQUEST_REJECTED_SUBSCRIBER = 'notifications.request-rejected';

/**
 * On a decision about a request: `request.accepted` or `request.rejected` for the author. The
 * outbox registry needs a unique name per subscription, so the same handler is registered twice:
 * itself for `RequestAccepted` and `rejections()` for `RequestRejected`.
 */
@Injectable()
export class RequestDecidedSubscriber implements EventSubscriber {
    readonly name = REQUEST_ACCEPTED_SUBSCRIBER;

    private readonly rule = new RequestDecisionRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    rejections(): EventSubscriber {
        return {
            name: REQUEST_REJECTED_SUBSCRIBER,
            handle: (event) => this.handle(event),
        };
    }

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof RequestAcceptedEvent) && !(event instanceof RequestRejectedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects RequestAcceptedEvent or RequestRejectedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        if (!this.rule.appliesTo(event)) return;
        const developerLogin = await this.users.findLoginById(event.decidedBy);
        if (developerLogin === null) throw new NotificationActorNotFoundError(event.decidedBy);
        await this.createNotifications.execute(event.id, this.rule.apply(event, developerLogin));
    }
}
