import { Injectable } from '@nestjs/common';
import { sql, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { formatFullName } from '../../../shared/people/full-name';
import { BUG_STATUSES, type BugStatus } from '../domain/bug-status';
import {
    BugQuery,
    type BugListRecord,
    type BugPerson,
    type BugRecord,
} from '../domain/ports/bug-query.port';
import type { Page, PageRequest } from '../domain/ports/page';
import { millis } from './sql-helpers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const viewRow = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(BUG_STATUSES),
    wont_fix_reason: z.string().nullable(),
    product_id: z.string(),
    product_name: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
    author_id: z.string(),
    author_login: z.string(),
    author_last_name: z.string().nullable(),
    author_first_name: z.string().nullable(),
    author_middle_name: z.string().nullable(),
    changer_id: z.string().nullable(),
    changer_login: z.string().nullable(),
    changer_last_name: z.string().nullable(),
    changer_first_name: z.string().nullable(),
    changer_middle_name: z.string().nullable(),
    created_at: z.number(),
    status_changed_at: z.number(),
});

type ViewRow = z.infer<typeof viewRow>;

const SELECT_VIEW = sql.fragment`
    SELECT b.id, b.title, b.description, b.status, b.wont_fix_reason,
           b.product_id, pr.name AS product_name, b.agent_id, ag.name AS agent_name,
           b.author_id, au.login AS author_login,
           ap.last_name AS author_last_name, ap.first_name AS author_first_name,
           ap.middle_name AS author_middle_name,
           b.status_changed_by AS changer_id, cu.login AS changer_login,
           cp.last_name AS changer_last_name, cp.first_name AS changer_first_name,
           cp.middle_name AS changer_middle_name,
           ${millis('b.created_at', 'created_at')},
           ${millis('b.status_changed_at', 'status_changed_at')}
    FROM portal_bugs b
    JOIN portal_products pr ON pr.id = b.product_id
    JOIN portal_agents ag ON ag.id = b.agent_id
    JOIN auth_users au ON au.id = b.author_id
    LEFT JOIN auth_user_profiles ap ON ap.user_id = b.author_id
    LEFT JOIN auth_users cu ON cu.id = b.status_changed_by
    LEFT JOIN auth_user_profiles cp ON cp.user_id = b.status_changed_by`;

function toListRecord(row: ViewRow): BugListRecord {
    return {
        id: row.id,
        title: row.title,
        product: { id: row.product_id, name: row.product_name },
        agent: { id: row.agent_id, name: row.agent_name },
        status: row.status,
        createdAt: new Date(row.created_at),
        statusChangedAt: new Date(row.status_changed_at),
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
    };
}

function toRecord(raw: unknown): BugRecord {
    const row = viewRow.parse(raw);
    const statusChangedBy: BugPerson | null =
        row.changer_id === null || row.changer_login === null
            ? null
            : {
                  id: row.changer_id,
                  login: row.changer_login,
                  fullName: formatFullName(
                      {
                          lastName: row.changer_last_name,
                          firstName: row.changer_first_name,
                          middleName: row.changer_middle_name,
                      },
                      row.changer_login,
                  ),
              };
    return {
        ...toListRecord(row),
        description: row.description,
        statusChangedBy,
        wontFixReason: row.wont_fix_reason,
    };
}

@Injectable()
export class SlonikBugQuery extends BugQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async findView(id: string): Promise<BugRecord | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${SELECT_VIEW} WHERE b.id = ${id}`);
        return row === null ? null : toRecord(row);
    }

    listByAuthor(authorId: string, page: PageRequest): Promise<Page<BugListRecord>> {
        return this.list(
            sql.fragment`b.author_id = ${authorId}`,
            sql.fragment`ORDER BY b.created_at DESC, b.id DESC`,
            page,
        );
    }

    listQueue(status: BugStatus | null, page: PageRequest): Promise<Page<BugListRecord>> {
        if (status === null) {
            return this.list(
                sql.fragment`b.status IN ('open', 'in_progress')`,
                sql.fragment`ORDER BY (b.status = 'in_progress'), b.created_at, b.id`,
                page,
            );
        }
        if (status === 'resolved' || status === 'wont_fix') {
            return this.list(
                sql.fragment`b.status = ${status}`,
                sql.fragment`ORDER BY b.status_changed_at DESC, b.id`,
                page,
            );
        }
        return this.list(
            sql.fragment`b.status = ${status}`,
            sql.fragment`ORDER BY b.created_at, b.id`,
            page,
        );
    }

    private async list(
        where: FragmentSqlToken,
        orderBy: FragmentSqlToken,
        page: PageRequest,
    ): Promise<Page<BugListRecord>> {
        const executor = this.transactions.executor();
        const total = await executor.oneFirst(
            sql.type(z.object({ count: z.number() }))`
                SELECT count(*)::int AS count FROM portal_bugs b WHERE ${where}`,
        );
        const rows = await executor.any(sql.unsafe`
            ${SELECT_VIEW} WHERE ${where} ${orderBy}
            LIMIT ${page.limit} OFFSET ${page.page * page.limit}`);
        return { items: rows.map((raw) => toListRecord(viewRow.parse(raw))), total };
    }
}
