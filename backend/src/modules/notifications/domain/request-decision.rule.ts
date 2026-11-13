import type { RequestAcceptedEvent } from '../../portal/contracts/request-accepted.event';
import type { RequestRejectedEvent } from '../../portal/contracts/request-rejected.event';
import { SKILL_STATUS_LABELS } from '../../portal/contracts/skill-status-labels';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/**
 * The author of a request learns about the decision of the developer. A developer who decides on
 * their own request needs no notification.
 */
export class RequestDecisionRule {
    appliesTo(event: RequestAcceptedEvent | RequestRejectedEvent): boolean {
        return event.authorId !== event.decidedBy;
    }

    /** `actorLogin` is the login of the developer who decided. */
    apply(
        event: RequestAcceptedEvent | RequestRejectedEvent,
        actorLogin: string,
    ): NotificationDraft[] {
        if (!this.appliesTo(event)) return [];
        const target = NotificationTarget.of({ type: 'request', id: event.requestId });
        if ('reason' in event) {
            return [
                {
                    recipientId: event.authorId,
                    type: 'request.rejected',
                    content: NotificationContent.of({
                        title: `Заявка отклонена: ${event.requestTitle}`,
                        body: `${actorLogin} отклонил заявку «${event.requestTitle}». Причина: ${event.reason}`,
                    }),
                    target,
                    actorId: event.decidedBy,
                },
            ];
        }
        return [
            {
                recipientId: event.authorId,
                type: 'request.accepted',
                content: NotificationContent.of({
                    title: `Заявка принята: ${event.requestTitle}`,
                    body: `${actorLogin} принял заявку «${event.requestTitle}» в навык «${event.skillName}». Статус навыка: ${SKILL_STATUS_LABELS[event.skillStatus]}`,
                }),
                target,
                actorId: event.decidedBy,
            },
        ];
    }
}
