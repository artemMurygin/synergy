import type { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

const TASK_CREATED_ON_BEHALF_TITLE = 'Задача поставлена от вашего имени';

/** The creator learns that another user (the initiator) set a task on their behalf. */
export class TaskCreatedOnBehalfRule {
    appliesTo(event: TaskCreatedEvent): boolean {
        return event.creatorId !== event.initiatorId;
    }

    /** `initiatorLogin` is the login of the user who actually set the task. */
    apply(event: TaskCreatedEvent, initiatorLogin: string): NotificationDraft[] {
        if (!this.appliesTo(event)) return [];
        return [
            {
                recipientId: event.creatorId,
                type: 'task.created-on-behalf',
                content: NotificationContent.of({
                    title: TASK_CREATED_ON_BEHALF_TITLE,
                    body: `Поставил ${initiatorLogin}: ${event.title}`,
                }),
                target: NotificationTarget.of({ type: 'task', id: event.taskId }),
                actorId: event.initiatorId,
            },
        ];
    }
}
