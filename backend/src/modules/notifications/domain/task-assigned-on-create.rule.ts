import type { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

const TASK_ASSIGNED_TITLE = 'Вам назначена задача';

/**
 * The assignee learns about a new task from the user who actually set it (the initiator). A task
 * the initiator assigned to themselves needs no notification; the creator set on someone's
 * behalf is notified as an assignee like anyone else.
 */
export class TaskAssignedOnCreateRule {
    appliesTo(event: TaskCreatedEvent): boolean {
        return event.assigneeId !== null && event.assigneeId !== event.initiatorId;
    }

    /** `actorLogin` is the login of the initiator. */
    apply(event: TaskCreatedEvent, actorLogin: string): NotificationDraft[] {
        const { assigneeId, initiatorId } = event;
        if (assigneeId === null || !this.appliesTo(event)) return [];
        return [
            {
                recipientId: assigneeId,
                type: 'task.assigned',
                content: NotificationContent.of({
                    title: TASK_ASSIGNED_TITLE,
                    body: `От ${actorLogin}: ${event.title}`,
                }),
                target: NotificationTarget.of({ type: 'task', id: event.taskId }),
                actorId: initiatorId,
            },
        ];
    }
}
