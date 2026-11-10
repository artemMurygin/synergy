import { Inject, Injectable } from '@nestjs/common';
import { sql, type CommonQueryMethods, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { FileName } from '../domain/file-name';
import {
    TaskAttachmentRepository,
    type InsertWithinLimitResult,
} from '../domain/ports/task-attachment-repository.port';
import { TaskAttachment } from '../domain/task-attachment';

const attachmentRow = z.object({
    id: z.string(),
    task_id: z.string(),
    original_name: z.string(),
    storage_key: z.string(),
    size_bytes: z.number(),
    content_type: z.string(),
    uploaded_by: z.string(),
    created_at: z.number(),
});

const COLUMNS = sql.fragment`
    id, task_id, original_name, storage_key, size_bytes::float8 AS size_bytes,
    content_type, uploaded_by,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at`;

function toAttachment(raw: unknown): TaskAttachment {
    const row = attachmentRow.parse(raw);
    return TaskAttachment.restore({
        id: row.id,
        taskId: row.task_id,
        originalName: FileName.of(row.original_name),
        storageKey: row.storage_key,
        sizeBytes: row.size_bytes,
        contentType: row.content_type,
        uploadedBy: row.uploaded_by,
        createdAt: new Date(row.created_at),
    });
}

async function insertRow(executor: CommonQueryMethods, attachment: TaskAttachment): Promise<void> {
    await executor.query(sql.unsafe`
        INSERT INTO task_attachment
            (id, task_id, original_name, storage_key, size_bytes, content_type,
             uploaded_by, created_at)
        VALUES (${attachment.id}, ${attachment.taskId}, ${attachment.originalName.value},
                ${attachment.storageKey}, ${attachment.sizeBytes}, ${attachment.contentType},
                ${attachment.uploadedBy}, ${sql.timestamp(attachment.createdAt)})`);
}

@Injectable()
export class SlonikTaskAttachmentRepository extends TaskAttachmentRepository {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    async insert(attachment: TaskAttachment): Promise<void> {
        await insertRow(this.pool, attachment);
    }

    async insertWithinLimit(
        attachment: TaskAttachment,
        limit: number,
    ): Promise<InsertWithinLimitResult> {
        return this.pool.transaction(async (tx) => {
            // The row lock serializes uploads (and a concurrent soft delete) of one task.
            const locked = await tx.maybeOne(sql.unsafe`
                SELECT id FROM task
                WHERE id = ${attachment.taskId} AND deleted_at IS NULL
                FOR UPDATE`);
            if (locked === null) return 'task-missing';
            const count = await tx.oneFirst(
                sql.type(z.object({ count: z.number() }))`
                    SELECT count(*)::int AS count FROM task_attachment
                    WHERE task_id = ${attachment.taskId}`,
            );
            if (count >= limit) return 'limit-reached';
            await insertRow(tx, attachment);
            return 'inserted';
        });
    }

    async listByTask(taskId: string): Promise<TaskAttachment[]> {
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${COLUMNS} FROM task_attachment
            WHERE task_id = ${taskId}
            ORDER BY created_at ASC, id ASC`);
        return rows.map(toAttachment);
    }

    async findByTask(taskId: string, attachmentId: string): Promise<TaskAttachment | null> {
        const row = await this.pool.maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM task_attachment
            WHERE id = ${attachmentId} AND task_id = ${taskId}`);
        return row === null ? null : toAttachment(row);
    }

    async countByTask(taskId: string): Promise<number> {
        return this.pool.oneFirst(
            sql.type(z.object({ count: z.number() }))`
                SELECT count(*)::int AS count FROM task_attachment WHERE task_id = ${taskId}`,
        );
    }

    async countByTasks(taskIds: readonly string[]): Promise<Map<string, number>> {
        const counts = new Map<string, number>();
        if (taskIds.length === 0) return counts;
        const rows = await this.pool.any(
            sql.type(z.object({ task_id: z.string(), count: z.number() }))`
                SELECT task_id, count(*)::int AS count FROM task_attachment
                WHERE task_id = ANY(${sql.array([...taskIds], 'uuid')})
                GROUP BY task_id`,
        );
        for (const row of rows) counts.set(row.task_id, row.count);
        return counts;
    }

    async delete(attachmentId: string): Promise<boolean> {
        const result = await this.pool.query(sql.unsafe`
            DELETE FROM task_attachment WHERE id = ${attachmentId}`);
        return result.rowCount > 0;
    }
}
