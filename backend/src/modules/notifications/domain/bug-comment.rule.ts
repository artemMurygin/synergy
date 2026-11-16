import type { BugCommentPostedEvent } from '../../portal/contracts/bug-comment-posted.event';
import { fitTitle } from './fit-text';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/**
 * A comment on a bug: when the author writes, every active developer except the author is
 * notified; otherwise only the author of the bug.
 */
export class BugCommentRule {
    recipients(event: BugCommentPostedEvent, developerIds: readonly string[]): string[] {
        if (event.commenterId === event.bugAuthorId) {
            return developerIds.filter((id) => id !== event.commenterId);
        }
        return [event.bugAuthorId];
    }

    /** `commenterName` is the full name of the commenter (the login when there is none). */
    apply(
        event: BugCommentPostedEvent,
        commenterName: string,
        developerIds: readonly string[],
    ): NotificationDraft[] {
        return this.recipients(event, developerIds).map((recipientId) => ({
            recipientId,
            type: 'bug.comment-added',
            content: NotificationContent.of({
                title: fitTitle('Новый комментарий к багу: ', event.bugTitle),
                body: `${commenterName}: ${event.excerpt}`,
            }),
            target: NotificationTarget.of({ type: 'bug', id: event.bugId }),
            actorId: event.commenterId,
        }));
    }
}
