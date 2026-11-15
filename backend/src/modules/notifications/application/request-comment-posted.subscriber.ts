import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { RequestCommentPostedEvent } from '../../portal/contracts/request-comment-posted.event';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { RequestCommentRule } from '../domain/request-comment.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const REQUEST_COMMENT_POSTED_SUBSCRIBER = 'notifications.request-comment-posted';

/** On a new comment to a request: `request.comment-added` for the other side of the conversation. */
@Injectable()
export class RequestCommentPostedSubscriber implements EventSubscriber {
    readonly name = REQUEST_COMMENT_POSTED_SUBSCRIBER;

    private readonly rule = new RequestCommentRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof RequestCommentPostedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects RequestCommentPostedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        const commenterName = await this.users.findFullNameById(event.commenterId);
        if (commenterName === null) throw new NotificationActorNotFoundError(event.commenterId);
        const developerIds =
            event.commenterId === event.requestAuthorId
                ? await this.users.listActiveDeveloperIds()
                : [];
        const drafts = this.rule.apply(event, commenterName, developerIds);
        if (drafts.length === 0) return;
        await this.createNotifications.execute(event.id, drafts);
    }
}
