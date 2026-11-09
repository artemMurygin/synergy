import type { TaskAttachment } from '../task-attachment';

/** Outcome of the atomic, limit-guarded insert. */
export type InsertWithinLimitResult = 'inserted' | 'limit-reached' | 'task-missing';

export abstract class TaskAttachmentRepository {
    abstract insert(attachment: TaskAttachment): Promise<void>;
    /**
     * Inserts only when the task is live and has fewer than `limit` attachments. The check and
     * the insert are one atomic step, so concurrent uploads cannot exceed the limit.
     */
    abstract insertWithinLimit(
        attachment: TaskAttachment,
        limit: number,
    ): Promise<InsertWithinLimitResult>;
    /** All attachments of the task, oldest first. */
    abstract listByTask(taskId: string): Promise<TaskAttachment[]>;
    /** Looks up the attachment only inside the given task. */
    abstract findByTask(taskId: string, attachmentId: string): Promise<TaskAttachment | null>;
    abstract countByTask(taskId: string): Promise<number>;
    /** Returns false when no such attachment existed (already deleted). */
    abstract delete(attachmentId: string): Promise<boolean>;
}
