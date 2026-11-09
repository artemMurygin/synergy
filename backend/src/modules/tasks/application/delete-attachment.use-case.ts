import { Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { AttachmentNotFoundError, TaskNotFoundError } from '../domain/errors';
import { FileStorage } from '../domain/ports/file-storage.port';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import { TaskRepository } from '../domain/ports/task-repository.port';

@Injectable()
export class DeleteAttachmentUseCase {
    private readonly logger = new Logger(DeleteAttachmentUseCase.name);

    constructor(
        private readonly tasks: TaskRepository,
        private readonly attachments: TaskAttachmentRepository,
        private readonly storage: FileStorage,
        private readonly policy: TaskAccessPolicy,
    ) {}

    /** Removes the record first, then the file: a leftover file is tolerable, a dangling record is not. */
    async execute(actor: Actor, taskId: string, attachmentId: string): Promise<void> {
        const task = await this.tasks.findById(taskId);
        if (task === null) throw new TaskNotFoundError(taskId);
        if (!this.policy.canUpdate(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'update', taskId);
        }
        const attachment = await this.attachments.findByTask(taskId, attachmentId);
        if (attachment === null) throw new AttachmentNotFoundError(attachmentId);

        const removed = await this.attachments.delete(attachmentId);
        if (!removed) throw new AttachmentNotFoundError(attachmentId);
        try {
            await this.storage.delete(attachment.storageKey);
        } catch (error) {
            this.logger.error(
                `File ${attachment.storageKey} of deleted attachment ${attachmentId} stays on disk: ${String(error)}`,
            );
        }
    }
}
