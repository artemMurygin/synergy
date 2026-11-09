import { Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { TaskNotFoundError } from '../domain/errors';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import { toAttachmentView } from './attachment-view';
import { toTaskView, type TaskDetailsView } from './task-view';

@Injectable()
export class GetTaskUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly attachments: TaskAttachmentRepository,
        private readonly users: UserDirectory,
        private readonly policy: TaskAccessPolicy,
    ) {}

    async execute(actor: Actor, id: string): Promise<TaskDetailsView> {
        const task = await this.tasks.findById(id);
        if (task === null) throw new TaskNotFoundError(id);
        if (!this.policy.canRead(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'read', id);
        }
        const [view, attachments] = await Promise.all([
            toTaskView(task, this.users),
            this.attachments.listByTask(id),
        ]);
        return { ...view, attachments: attachments.map(toAttachmentView) };
    }
}
