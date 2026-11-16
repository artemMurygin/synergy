import type { BugStatusChangedEvent } from '../../portal/contracts/bug-status-changed.event';
import { BUG_STATUS_LABELS } from '../../portal/contracts/bug-status-labels';
import { fitTitle, truncate } from './fit-text';
import { MAX_NOTIFICATION_BODY_LENGTH, NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/** The author of a bug learns about a status change; own changes need no notification. */
export class BugStatusChangedRule {
    /** `developerName` is the full name of who changed the status. */
    apply(event: BugStatusChangedEvent, developerName: string): NotificationDraft[] {
        if (event.changedBy === event.authorId) return [];
        const head = `${developerName} сменил статус`;
        const reasonPrefix = '\nПричина: ';
        const body =
            event.to === 'wont_fix' && event.reason !== null
                ? `${head}${reasonPrefix}${truncate(
                      event.reason,
                      MAX_NOTIFICATION_BODY_LENGTH - head.length - reasonPrefix.length,
                  )}`
                : head;
        return [
            {
                recipientId: event.authorId,
                type: 'bug.status-changed',
                content: NotificationContent.of({
                    title: fitTitle('Баг «', event.title, `»: ${BUG_STATUS_LABELS[event.to]}`),
                    body,
                }),
                target: NotificationTarget.of({ type: 'bug', id: event.bugId }),
                actorId: event.changedBy,
            },
        ];
    }
}
