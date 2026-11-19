import { Injectable, Logger } from '@nestjs/common';
import { AttachmentNotFoundError, TaskAttachmentTokenInvalidError } from '../domain/errors';
import { AttachmentDownloadTokenPort } from '../domain/ports/attachment-download-token.port';
import { FileStorage } from '../domain/ports/file-storage.port';
import { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import { toAttachmentView } from './attachment-view';
import type { DownloadedAttachment } from './download-attachment.use-case';

/** Доступ по токену из ссылки, без актора: 403 для плохого токена, 404 для удалённого. */
@Injectable()
export class DownloadAttachmentByTokenUseCase {
    private readonly logger = new Logger(DownloadAttachmentByTokenUseCase.name);

    constructor(
        private readonly attachments: TaskAttachmentRepository,
        private readonly storage: FileStorage,
        private readonly tokens: AttachmentDownloadTokenPort,
    ) {}

    async execute(
        taskId: string,
        attachmentId: string,
        token: string,
    ): Promise<DownloadedAttachment> {
        // Токен проверяется первым, чтобы не раскрывать существование вложения.
        if (!this.tokens.verify(token, attachmentId)) throw new TaskAttachmentTokenInvalidError();
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
