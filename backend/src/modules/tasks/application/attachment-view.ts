import type { TaskAttachment } from '../domain/task-attachment';

export interface AttachmentView {
    id: string;
    taskId: string;
    originalName: string;
    sizeBytes: number;
    contentType: string;
    uploadedBy: string;
    createdAt: Date;
}

export function toAttachmentView(attachment: TaskAttachment): AttachmentView {
    return {
        id: attachment.id,
        taskId: attachment.taskId,
        originalName: attachment.originalName.value,
        sizeBytes: attachment.sizeBytes,
        contentType: attachment.contentType,
        uploadedBy: attachment.uploadedBy,
        createdAt: attachment.createdAt,
    };
}
