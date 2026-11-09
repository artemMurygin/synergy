import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { AttachmentLimitReachedError, TaskNotFoundError } from '../domain/errors';
import { FileName } from '../domain/file-name';
import { Clock } from '../domain/ports/clock.port';
import { FileStorage } from '../domain/ports/file-storage.port';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import {
    TaskAttachmentRepository,
    type InsertWithinLimitResult,
} from '../domain/ports/task-attachment-repository.port';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { TasksSettings } from '../domain/ports/tasks-settings.port';
import { TaskAttachment } from '../domain/task-attachment';
import { toAttachmentView, type AttachmentView } from './attachment-view';

export interface UploadedFile {
    name: string;
    contentType: string;
    stream: Readable;
}

@Injectable()
export class UploadAttachmentUseCase {
    private readonly logger = new Logger(UploadAttachmentUseCase.name);

    constructor(
        private readonly tasks: TaskRepository,
        private readonly attachments: TaskAttachmentRepository,
        private readonly storage: FileStorage,
        private readonly settings: TasksSettings,
        private readonly policy: TaskAccessPolicy,
        private readonly clock: Clock,
    ) {}

    async execute(actor: Actor, taskId: string, file: UploadedFile): Promise<AttachmentView> {
        const task = await this.tasks.findById(taskId);
        if (task === null) throw new TaskNotFoundError(taskId);
        if (!this.policy.canUpdate(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'update', taskId);
        }
        const originalName = FileName.of(file.name);
        const count = await this.attachments.countByTask(taskId);
        if (count >= this.settings.maxFilesPerTask) {
            throw new AttachmentLimitReachedError(this.settings.maxFilesPerTask);
        }

        const saved = await this.storage.save(file.stream, {
            maxBytes: this.settings.maxFileSizeBytes,
        });
        const attachment = TaskAttachment.create({
            id: randomUUID(),
            taskId,
            originalName,
            storageKey: saved.storageKey,
            sizeBytes: saved.sizeBytes,
            contentType: file.contentType,
            uploadedBy: actor.userId,
            createdAt: this.clock.now(),
        });
        let outcome: InsertWithinLimitResult;
        try {
            outcome = await this.attachments.insertWithinLimit(
                attachment,
                this.settings.maxFilesPerTask,
            );
        } catch (error) {
            await this.compensate(saved.storageKey);
            throw error;
        }
        if (outcome !== 'inserted') {
            await this.compensate(saved.storageKey);
            if (outcome === 'task-missing') throw new TaskNotFoundError(taskId);
            throw new AttachmentLimitReachedError(this.settings.maxFilesPerTask);
        }
        return toAttachmentView(attachment);
    }

    private async compensate(storageKey: string): Promise<void> {
        try {
            await this.storage.delete(storageKey);
        } catch (error) {
            this.logger.error(
                `Orphan file ${storageKey} left after a failed upload: ${String(error)}`,
            );
        }
    }
}
