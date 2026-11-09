import type { FileName } from './file-name';

export interface CreateTaskAttachmentInput {
    id: string;
    taskId: string;
    originalName: FileName;
    storageKey: string;
    sizeBytes: number;
    contentType: string;
    uploadedBy: string;
    createdAt: Date;
}

/** Metadata of a file attached to a task; the bytes live in FileStorage under `storageKey`. */
export class TaskAttachment {
    readonly id: string;
    readonly taskId: string;
    readonly originalName: FileName;
    readonly storageKey: string;
    readonly sizeBytes: number;
    readonly contentType: string;
    readonly uploadedBy: string;
    readonly createdAt: Date;

    private constructor(input: CreateTaskAttachmentInput) {
        this.id = input.id;
        this.taskId = input.taskId;
        this.originalName = input.originalName;
        this.storageKey = input.storageKey;
        this.sizeBytes = input.sizeBytes;
        this.contentType = input.contentType;
        this.uploadedBy = input.uploadedBy;
        this.createdAt = input.createdAt;
        Object.freeze(this);
    }

    static create(input: CreateTaskAttachmentInput): TaskAttachment {
        return new TaskAttachment(input);
    }

    /** Rebuilds an attachment from storage; same shape as create(). */
    static restore(input: CreateTaskAttachmentInput): TaskAttachment {
        return new TaskAttachment(input);
    }
}
