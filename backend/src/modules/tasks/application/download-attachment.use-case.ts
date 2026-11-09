import { Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { AttachmentNotFoundError, TaskNotFoundError } from '../domain/errors';
import { FileStorage } from '../domain/ports/file-storage.port';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { toAttachmentView, type AttachmentView } from './attachment-view';

export interface DownloadedAttachment {
    meta: AttachmentView;
    stream: Readable;
}

@Injectable()
export class DownloadAttachmentUseCase {
    private readonly logger = new Logger(DownloadAttachmentUseCase.name);

    constructor(
        private readonly tasks: TaskRepository,
        private readonly attachments: TaskAttachmentRepository,
        private readonly storage: FileStorage,
        private readonly policy: TaskAccessPolicy,
    ) {}

    async execute(
        actor: Actor,
        taskId: string,
        attachmentId: string,
    ): Promise<DownloadedAttachment> {
        const task = await this.tasks.findById(taskId);
        if (task === null) throw new TaskNotFoundError(taskId);
        if (!this.policy.canRead(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'read', taskId);
        }
        const attachment = await this.attachments.findByTask(taskId, attachmentId);
        if (attachment === null) throw new AttachmentNotFoundError(attachmentId);

        const stream = await this.storage.open(attachment.storageKey);
        if (stream === null) {
            this.logger.error(
                `File of attachment ${attachmentId} (task ${taskId}) is missing in storage: ${attachment.storageKey}`,
            );
            throw new AttachmentNotFoundError(attachmentId);
        }
        return { meta: toAttachmentView(attachment), stream };
    }
}
