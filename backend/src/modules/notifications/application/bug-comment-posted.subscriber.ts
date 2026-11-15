import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { BugCommentPostedEvent } from '../../portal/contracts/bug-comment-posted.event';
import { BugCommentRule } from '../domain/bug-comment.rule';
import { NotificationActorNotFoundError } from '../domain/errors';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const BUG_COMMENT_POSTED_SUBSCRIBER = 'notifications.bug-comment-posted';

/** On a new comment to a bug: `bug.comment-added` for the other side of the conversation. */
@Injectable()
export class BugCommentPostedSubscriber implements EventSubscriber {
    readonly name = BUG_COMMENT_POSTED_SUBSCRIBER;

    private readonly rule = new BugCommentRule();

    constructor(
        private readonly users: UserDirectoryPort,
        private readonly createNotifications: CreateNotificationsUseCase,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof BugCommentPostedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects BugCommentPostedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        const commenterName = await this.users.findFullNameById(event.commenterId);
        if (commenterName === null) throw new NotificationActorNotFoundError(event.commenterId);
        const developerIds =
            event.commenterId === event.bugAuthorId
                ? await this.users.listActiveDeveloperIds()
                : [];
        const drafts = this.rule.apply(event, commenterName, developerIds);
        if (drafts.length === 0) return;
        await this.createNotifications.execute(event.id, drafts);
    }
}
