import { SKILL_STATUS_LABELS } from '../../portal/contracts/skill-status-labels';
import type { SkillStatusChangedEvent } from '../../portal/contracts/skill-status-changed.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

/**
 * One notification per request of the snapshot taken with the status change, so that an author
 * with several requests for one skill gets one notification for each. Requests of the developer
 * who changed the status are skipped.
 */
export class SkillStatusChangedRule {
    appliesTo(event: SkillStatusChangedEvent): boolean {
        return event.linked.some((request) => request.authorId !== event.changedBy);
    }

    apply(event: SkillStatusChangedEvent): NotificationDraft[] {
        const status = SKILL_STATUS_LABELS[event.to];
        return event.linked
            .filter((request) => request.authorId !== event.changedBy)
            .map((request) => ({
                recipientId: request.authorId,
                type: 'request.status-changed',
                content: NotificationContent.of({
                    title: `Статус навыка изменён: ${status}`,
                    body: `Заявка «${request.title}»: навык «${event.skillName}» теперь в статусе «${status}»`,
                }),
                target: NotificationTarget.of({ type: 'request', id: request.requestId }),
                actorId: event.changedBy,
            }));
    }
}
