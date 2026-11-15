import type { RequestCommentPostedEvent } from '../../portal/contracts/request-comment-posted.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/**
 * A comment on a request: when the author writes, every active developer except the author is
 * notified; otherwise only the author of the request.
 */
export class RequestCommentRule {
    recipients(event: RequestCommentPostedEvent, developerIds: readonly string[]): string[] {
        if (event.commenterId === event.requestAuthorId) {
            return developerIds.filter((id) => id !== event.commenterId);
        }
        return [event.requestAuthorId];
    }

    /** `commenterName` is the full name of the commenter (the login when there is none). */
    apply(
        event: RequestCommentPostedEvent,
        commenterName: string,
        developerIds: readonly string[],
    ): NotificationDraft[] {
        return this.recipients(event, developerIds).map((recipientId) => ({
            recipientId,
            type: 'request.comment-added',
            content: NotificationContent.of({
                title: `Новый комментарий к заявке: ${event.requestTitle}`,
                body: `${commenterName}: ${event.excerpt}`,
            }),
            target: NotificationTarget.of({ type: 'request', id: event.requestId }),
            actorId: event.commenterId,
        }));
    }
}
