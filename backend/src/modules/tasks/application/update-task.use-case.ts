import { Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { TaskNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import { TaskStatus } from '../domain/task-status';
import { TaskTitle } from '../domain/task-title';
import { assertActiveUsers, toTaskView, type TaskView } from './task-view';

/** Only provided keys change; `null` clears the deadline or the assignee. */
export interface TaskPatch {
    title?: string;
    description?: string;
    status?: string;
    deadline?: Date | null;
    assigneeId?: string | null;
    watcherIds?: readonly string[];
}

@Injectable()
export class UpdateTaskUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly attachments: TaskAttachmentRepository,
        private readonly users: UserDirectory,
        private readonly policy: TaskAccessPolicy,
        private readonly clock: Clock,
    ) {}

    async execute(actor: Actor, id: string, patch: TaskPatch): Promise<TaskView> {
        const task = await this.tasks.findById(id);
        if (task === null) throw new TaskNotFoundError(id);
        if (!this.policy.canUpdate(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'update', id);
        }

        // Everything that can fail is checked before the task is touched.
        const title = patch.title === undefined ? undefined : TaskTitle.of(patch.title);
        const status = patch.status === undefined ? undefined : TaskStatus.parse(patch.status);
        await assertActiveUsers(this.users, [patch.assigneeId, ...(patch.watcherIds ?? [])]);

        if (title !== undefined) task.rename(title);
        if (patch.description !== undefined) task.changeDescription(patch.description);
        if (patch.deadline !== undefined) task.changeDeadline(patch.deadline);
        if (patch.assigneeId !== undefined) task.assign(patch.assigneeId);
        if (patch.watcherIds !== undefined) task.replaceWatchers(patch.watcherIds);
        if (status !== undefined) task.changeStatus(status, this.clock.now());

        await this.tasks.save(task);
        return toTaskView(task, this.users, await this.attachments.countByTask(id));
    }
}
