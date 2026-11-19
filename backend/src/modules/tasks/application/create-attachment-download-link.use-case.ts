import { Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { AttachmentNotFoundError, TaskNotFoundError } from '../domain/errors';
import { AttachmentDownloadTokenPort } from '../domain/ports/attachment-download-token.port';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { TasksSettings } from '../domain/ports/tasks-settings.port';

export interface AttachmentDownloadLink {
    url: string;
    expiresAt: Date;
}

@Injectable()
export class CreateAttachmentDownloadLinkUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly attachments: TaskAttachmentRepository,
        private readonly policy: TaskAccessPolicy,
        private readonly tokens: AttachmentDownloadTokenPort,
        private readonly settings: TasksSettings,
    ) {}

    async execute(
        actor: Actor,
        taskId: string,
        attachmentId: string,
    ): Promise<AttachmentDownloadLink> {
        const task = await this.tasks.findById(taskId);
        if (task === null) throw new TaskNotFoundError(taskId);
        if (!this.policy.canRead(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'read', taskId);
        }
        const attachment = await this.attachments.findByTask(taskId, attachmentId);
        if (attachment === null) throw new AttachmentNotFoundError(attachmentId);

        const { token, expiresAt } = this.tokens.sign(
            attachment.id,
            this.settings.downloadLinkTtlSec,
        );
        return {
            url: `/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachment.id)}/content?token=${encodeURIComponent(token)}`,
            expiresAt,
        };
    }
}
