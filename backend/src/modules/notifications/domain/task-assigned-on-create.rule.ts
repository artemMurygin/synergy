import type { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';

const TASK_ASSIGNED_TITLE = 'Вам назначена задача';

export class TaskAssignedOnCreateRule {
    apply(event: TaskCreatedEvent, actorLogin: string): NotificationDraft[] {
        const { assigneeId, creatorId } = event;
        if (assigneeId === null || assigneeId === creatorId) return [];
        return [
            {
                recipientId: assigneeId,
                type: 'task.assigned',
                content: NotificationContent.of({
                    title: TASK_ASSIGNED_TITLE,
                    body: `${actorLogin} назначил вас ответственным: ${event.title}`,
                }),
                target: NotificationTarget.of({ type: 'task', id: event.taskId }),
                actorId: creatorId,
            },
        ];
    }
}
