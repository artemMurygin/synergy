import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { formatFullName } from '../../../shared/people/full-name';
import { BugCommentQuery, type BugCommentRecord } from '../domain/ports/bug-comment-query.port';
import { millis, toDate, UUID_PATTERN } from './sql-helpers';

const commentViewRow = z.object({
    id: z.string(),
    author_id: z.string(),
    author_login: z.string(),
    author_last_name: z.string().nullable(),
    author_first_name: z.string().nullable(),
    author_middle_name: z.string().nullable(),
    body: z.string(),
    is_bug_author: z.boolean(),
    created_at: z.number(),
    edited_at: z.number().nullable(),
});

const SELECT_VIEW = sql.fragment`
    SELECT c.id, c.author_id, u.login AS author_login,
           p.last_name AS author_last_name, p.first_name AS author_first_name,
           p.middle_name AS author_middle_name, c.body,
           (c.author_id = b.author_id) AS is_bug_author,
           ${millis('c.created_at', 'created_at')}, ${millis('c.edited_at', 'edited_at')}
    FROM portal_bug_comments c
    JOIN portal_bugs b ON b.id = c.bug_id
    JOIN auth_users u ON u.id = c.author_id
    LEFT JOIN auth_user_profiles p ON p.user_id = c.author_id`;

function toRecord(raw: unknown): BugCommentRecord {
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
        authorRole: row.is_bug_author ? 'bug_author' : 'developer',
        createdAt: new Date(row.created_at),
        editedAt: toDate(row.edited_at),
    };
}

@Injectable()
export class SlonikBugCommentQuery extends BugCommentQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async listByBug(bugId: string): Promise<BugCommentRecord[]> {
        if (!UUID_PATTERN.test(bugId)) return [];
        const rows = await this.transactions.executor().any(sql.unsafe`
            ${SELECT_VIEW} WHERE c.bug_id = ${bugId}
            ORDER BY c.created_at, c.id`);
        return rows.map(toRecord);
    }

    async findView(id: string): Promise<BugCommentRecord | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${SELECT_VIEW} WHERE c.id = ${id}`);
        return row === null ? null : toRecord(row);
    }
}
