import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DraftOrigin } from '../domain/draft-origin';
import { DraftTaskItem } from '../domain/draft-task-item';
import { TaskBatchDraftRepositoryPort } from '../domain/ports/task-batch-draft-repository.port';
import { TASK_BATCH_DRAFT_STATUSES, TaskBatchDraft } from '../domain/task-batch-draft';
import { TaskBatchResult } from '../domain/task-batch-result';

/** Формат элемента `items` в JSONB: даты в ISO, title — строка. */
const storedItem = z.object({
    title: z.string(),
    description: z.string(),
    deadline: z.string().nullable(),
    assigneeId: z.string().nullable(),
    creatorId: z.string(),
    watcherIds: z.array(z.string()),
    sourceNote: z.string().nullable(),
});

const storedOrigin = z.object({
    kind: z.literal('meeting'),
    fileId: z.string(),
    recordingName: z.string(),
});

const storedResultItem = z.discriminatedUnion('status', [
    z.object({ index: z.number(), status: z.literal('created'), taskId: z.string() }),
    z.object({ index: z.number(), status: z.literal('failed'), reason: z.string() }),
]);

const draftRow = z.object({
    id: z.string(),
    owner_id: z.string(),
    thread_id: z.string(),
    items: z.array(storedItem),
    origin: storedOrigin.nullable(),
    status: z.enum(TASK_BATCH_DRAFT_STATUSES),
    result: z.object({ items: z.array(storedResultItem) }).nullable(),
    created_at: z.number(),
});

function toStoredItem(item: DraftTaskItem): z.infer<typeof storedItem> {
    return {
        title: item.title.value,
        description: item.description,
        deadline: item.deadline?.toISOString() ?? null,
        assigneeId: item.assigneeId,
        creatorId: item.creatorId,
        watcherIds: [...item.watcherIds],
        sourceNote: item.sourceNote,
    };
}

function toDraft(raw: unknown): TaskBatchDraft {
    const row = draftRow.parse(raw);
    return TaskBatchDraft.restore({
        id: row.id,
        ownerId: row.owner_id,
        threadId: row.thread_id,
        items: row.items.map((item) =>
            DraftTaskItem.of({
                ...item,
                deadline: item.deadline === null ? null : new Date(item.deadline),
            }),
        ),
        origin: row.origin === null ? null : DraftOrigin.meeting(row.origin),
        status: row.status,
        result: row.result === null ? null : TaskBatchResult.of(row.result.items),
        createdAt: new Date(row.created_at),
    });
}

@Injectable()
export class TaskBatchDraftRepository extends TaskBatchDraftRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async save(draft: TaskBatchDraft): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO task_batch_draft
                (id, owner_id, thread_id, items, origin, status, result, created_at)
            VALUES (${draft.id}, ${draft.ownerId}, ${draft.threadId},
                    ${sql.jsonb(draft.items.map(toStoredItem))},
                    ${draft.origin === null ? null : sql.jsonb({ ...draft.origin })},
                    ${draft.status},
                    ${draft.result === null ? null : sql.jsonb({ items: draft.result.items.map((i) => ({ ...i })) })},
                    ${sql.timestamp(draft.createdAt)})`);
    }

    async findById(id: string, ownerId: string): Promise<TaskBatchDraft | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, owner_id, thread_id, items, origin, status, result,
                   (extract(epoch FROM created_at) * 1000)::float8 AS created_at
            FROM task_batch_draft
            WHERE id = ${id} AND owner_id = ${ownerId}`);
        return row === null ? null : toDraft(row);
    }

    async supersedeActive(threadId: string, ownerId: string): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE task_batch_draft SET status = 'superseded'
            WHERE thread_id = ${threadId} AND owner_id = ${ownerId} AND status = 'draft'`);
    }

    async consume(id: string, ownerId: string): Promise<boolean> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            UPDATE task_batch_draft SET status = 'consumed'
            WHERE id = ${id} AND owner_id = ${ownerId} AND status = 'draft'
            RETURNING id`);
        return row !== null;
    }

    async saveResult(id: string, result: TaskBatchResult): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE task_batch_draft
            SET result = ${sql.jsonb({ items: result.items.map((item) => ({ ...item })) })}
            WHERE id = ${id}`);
    }
}
