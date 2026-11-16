import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { BugComment } from '../domain/bug-comment';
import { CommentBody } from '../domain/comment-body';
import { BugCommentRepository } from '../domain/ports/bug-comment-repository.port';
import { millis, nullableTimestamp, toDate, UUID_PATTERN } from './sql-helpers';

const commentRow = z.object({
    id: z.string(),
    bug_id: z.string(),
    author_id: z.string(),
    body: z.string(),
    created_at: z.number(),
    edited_at: z.number().nullable(),
});

@Injectable()
export class SlonikBugCommentRepository extends BugCommentRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async insert(comment: BugComment): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO portal_bug_comments (id, bug_id, author_id, body, created_at, edited_at)
            VALUES (${comment.id}, ${comment.bugId}, ${comment.authorId},
                    ${comment.body.value}, ${sql.timestamp(comment.createdAt)},
                    ${nullableTimestamp(comment.editedAt)})`);
    }

    async findById(id: string): Promise<BugComment | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const raw = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, bug_id, author_id, body,
                   ${millis('created_at', 'created_at')}, ${millis('edited_at', 'edited_at')}
            FROM portal_bug_comments WHERE id = ${id}`);
        if (raw === null) return null;
        const row = commentRow.parse(raw);
        return BugComment.restore({
            id: row.id,
            bugId: row.bug_id,
            authorId: row.author_id,
            body: CommentBody.of(row.body),
            createdAt: new Date(row.created_at),
            editedAt: toDate(row.edited_at),
        });
    }

    async update(comment: BugComment): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE portal_bug_comments
            SET body = ${comment.body.value}, edited_at = ${nullableTimestamp(comment.editedAt)}
            WHERE id = ${comment.id}`);
    }
}
