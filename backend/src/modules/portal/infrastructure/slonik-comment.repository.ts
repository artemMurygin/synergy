import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { CommentBody } from '../domain/comment-body';
import { CommentRepository } from '../domain/ports/comment-repository.port';
import { RequestComment } from '../domain/request-comment';
import { millis, nullableTimestamp, toDate } from './sql-helpers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const commentRow = z.object({
    id: z.string(),
    request_id: z.string(),
    author_id: z.string(),
    body: z.string(),
    created_at: z.number(),
    edited_at: z.number().nullable(),
});

@Injectable()
export class SlonikCommentRepository extends CommentRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async insert(comment: RequestComment): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO portal_request_comments
                (id, request_id, author_id, body, created_at, edited_at)
            VALUES (${comment.id}, ${comment.requestId}, ${comment.authorId},
                    ${comment.body.value}, ${sql.timestamp(comment.createdAt)},
                    ${nullableTimestamp(comment.editedAt)})`);
    }

    async findById(id: string): Promise<RequestComment | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const raw = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, request_id, author_id, body,
                   ${millis('created_at', 'created_at')}, ${millis('edited_at', 'edited_at')}
            FROM portal_request_comments WHERE id = ${id}`);
        if (raw === null) return null;
        const row = commentRow.parse(raw);
        return RequestComment.restore({
            id: row.id,
            requestId: row.request_id,
            authorId: row.author_id,
            body: CommentBody.of(row.body),
            createdAt: new Date(row.created_at),
            editedAt: toDate(row.edited_at),
        });
    }

    async update(comment: RequestComment): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE portal_request_comments
            SET body = ${comment.body.value}, edited_at = ${nullableTimestamp(comment.editedAt)}
            WHERE id = ${comment.id}`);
    }
}
