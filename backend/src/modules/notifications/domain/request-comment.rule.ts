import type { RequestCommentPostedEvent } from '../../portal/contracts/request-comment-posted.event';
import { MAX_NOTIFICATION_TITLE_LENGTH, NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

const TITLE_PREFIX = 'Новый комментарий к заявке: ';

function fitTitle(requestTitle: string): string {
    const room = MAX_NOTIFICATION_TITLE_LENGTH - TITLE_PREFIX.length;
    if (requestTitle.length <= room) return `${TITLE_PREFIX}${requestTitle}`;
    let cut = requestTitle.slice(0, room - 1);
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return `${TITLE_PREFIX}${cut}…`;
}

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
                title: fitTitle(event.requestTitle),
                body: `${commenterName}: ${event.excerpt}`,
            }),
            target: NotificationTarget.of({ type: 'request', id: event.requestId }),
            actorId: event.commenterId,
        }));
    }
}
