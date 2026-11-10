import type { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

const TASK_ASSIGNED_TITLE = 'Вам назначена задача';

export class TaskAssignedOnCreateRule {
    appliesTo(event: TaskCreatedEvent): boolean {
        return event.assigneeId !== null && event.assigneeId !== event.creatorId;
    }

    apply(event: TaskCreatedEvent, actorLogin: string): NotificationDraft[] {
        const { assigneeId, creatorId } = event;
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
                actorId: creatorId,
            },
        ];
    }
}
