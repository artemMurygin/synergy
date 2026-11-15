import type { RequestTakenEvent } from '../../portal/contracts/request-taken.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/**
 * The author of a request learns that a developer has taken it. A developer who takes their own
 * request needs no notification.
 */
export class RequestTakenRule {
    appliesTo(event: RequestTakenEvent): boolean {
        return event.authorId !== event.reviewerId;
    }

    /** `reviewerName` is the full name of the developer (the login when there is none). */
    apply(event: RequestTakenEvent, reviewerName: string): NotificationDraft[] {
        if (!this.appliesTo(event)) return [];
        return [
            {
                recipientId: event.authorId,
                type: 'request.under-review',
                content: NotificationContent.of({
                    title: `Заявка взята в работу: ${event.requestTitle}`,
                    body: `${reviewerName} взял в работу заявку «${event.requestTitle}»`,
                }),
                target: NotificationTarget.of({ type: 'request', id: event.requestId }),
                actorId: event.reviewerId,
            },
        ];
    }
}
