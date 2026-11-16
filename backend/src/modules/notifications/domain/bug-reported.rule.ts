import type { BugReportedEvent } from '../../portal/contracts/bug-reported.event';
import { fitTitle } from './fit-text';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/** A new bug: every active developer except the author is notified. */
export class BugReportedRule {
    /** `authorName` is the full name of the author (the login when there is none). */
    apply(
        event: BugReportedEvent,
        authorName: string,
        developerIds: readonly string[],
    ): NotificationDraft[] {
        return developerIds
            .filter((id) => id !== event.authorId)
            .map((recipientId) => ({
                recipientId,
                type: 'bug.reported',
                content: NotificationContent.of({
                    title: fitTitle('Новый баг: ', event.title),
                    body: `${authorName} · ${event.productName} · ${event.agentName}`,
                }),
                target: NotificationTarget.of({ type: 'bug', id: event.bugId }),
                actorId: event.authorId,
            }));
    }
}
