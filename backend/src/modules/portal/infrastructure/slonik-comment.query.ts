import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { formatFullName } from '../../../shared/people/full-name';
import { CommentQuery, type CommentRecord } from '../domain/ports/comment-query.port';
import { millis, toDate } from './sql-helpers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const commentViewRow = z.object({
    id: z.string(),
    author_id: z.string(),
    author_login: z.string(),
    author_last_name: z.string().nullable(),
    author_first_name: z.string().nullable(),
    author_middle_name: z.string().nullable(),
    body: z.string(),
    is_request_author: z.boolean(),
    created_at: z.number(),
    edited_at: z.number().nullable(),
});

const SELECT_VIEW = sql.fragment`
    SELECT c.id, c.author_id, u.login AS author_login,
           p.last_name AS author_last_name, p.first_name AS author_first_name,
           p.middle_name AS author_middle_name, c.body,
           (c.author_id = r.author_id) AS is_request_author,
           ${millis('c.created_at', 'created_at')}, ${millis('c.edited_at', 'edited_at')}
    FROM portal_request_comments c
    JOIN portal_requests r ON r.id = c.request_id
    JOIN auth_users u ON u.id = c.author_id
    LEFT JOIN auth_user_profiles p ON p.user_id = c.author_id`;

function toRecord(raw: unknown): CommentRecord {
    const row = commentViewRow.parse(raw);
    return {
        id: row.id,
        authorId: row.author_id,
        body: row.body,
        author: {
            id: row.author_id,
            login: row.author_login,
            fullName: formatFullName(
                {
                    lastName: row.author_last_name,
                    firstName: row.author_first_name,
                    middleName: row.author_middle_name,
                },
                row.author_login,
            ),
        },
        authorRole: row.is_request_author ? 'request_author' : 'developer',
        createdAt: new Date(row.created_at),
        editedAt: toDate(row.edited_at),
    };
}

@Injectable()
export class SlonikCommentQuery extends CommentQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async listByRequest(requestId: string): Promise<CommentRecord[]> {
        if (!UUID_PATTERN.test(requestId)) return [];
        const rows = await this.transactions.executor().any(sql.unsafe`
            ${SELECT_VIEW} WHERE c.request_id = ${requestId}
            ORDER BY c.created_at, c.id`);
        return rows.map(toRecord);
    }

    async findView(id: string): Promise<CommentRecord | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${SELECT_VIEW} WHERE c.id = ${id}`);
        return row === null ? null : toRecord(row);
    }
}
