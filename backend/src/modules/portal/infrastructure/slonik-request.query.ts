import { Injectable } from '@nestjs/common';
import { sql, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';
import { formatFullName } from '../../../shared/people/full-name';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Frequency } from '../domain/frequency';
import type { Page, PageRequest } from '../domain/ports/page';
import { RequestQuery, type RequestView } from '../domain/ports/request-query.port';
import { RequestDecision } from '../domain/request-decision';
import { RequestStatusPolicy } from '../domain/request-status-policy';
import { SkillStatus } from '../domain/skill-status';
import { millis } from './sql-helpers';

const viewRow = z.object({
    id: z.string(),
    author_id: z.string(),
    author_login: z.string(),
    author_last_name: z.string().nullable(),
    author_first_name: z.string().nullable(),
    author_middle_name: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    frequency_count: z.number(),
    frequency_period: z.string(),
    minutes_per_run: z.number(),
    people_count: z.number(),
    decision: z.enum(['pending', 'accepted', 'rejected']),
    skill_id: z.string().nullable(),
    skill_name: z.string().nullable(),
    skill_description: z.string().nullable(),
    skill_status: z.string().nullable(),
    reject_reason: z.string().nullable(),
    created_at: z.number(),
});

const SELECT_VIEW = sql.fragment`
    SELECT r.id, r.author_id, u.login AS author_login,
           p.last_name AS author_last_name, p.first_name AS author_first_name,
           p.middle_name AS author_middle_name, r.title, r.description,
           r.frequency_count, r.frequency_period, r.minutes_per_run, r.people_count,
           r.decision, r.skill_id, s.name AS skill_name, s.description AS skill_description,
           s.status AS skill_status, r.reject_reason,
           ${millis('r.created_at', 'created_at')}
    FROM portal_requests r
    JOIN auth_users u ON u.id = r.author_id
    LEFT JOIN auth_user_profiles p ON p.user_id = r.author_id
    LEFT JOIN portal_skills s ON s.id = r.skill_id`;

/** Статус для автора выводится политикой; решение собирается только для вывода статуса. */
function toView(raw: unknown): RequestView {
    const row = viewRow.parse(raw);
    const decision =
        row.decision === 'pending'
            ? RequestDecision.pending()
            : row.decision === 'accepted'
              ? RequestDecision.accepted(row.skill_id ?? '', '', new Date(0))
              : RequestDecision.rejected(row.reject_reason ?? '', '', new Date(0));
    const frequency = Frequency.of(row.frequency_count, row.frequency_period);
    const skill =
        row.skill_id === null
            ? null
            : {
                  id: row.skill_id,
                  name: row.skill_name ?? '',
                  description: row.skill_description ?? '',
              };
    return {
        id: row.id,
        authorId: row.author_id,
        authorLogin: row.author_login,
        authorFullName: formatFullName(
            {
                lastName: row.author_last_name,
                firstName: row.author_first_name,
                middleName: row.author_middle_name,
            },
            row.author_login,
        ),
        title: row.title,
        description: row.description,
        frequency: { count: frequency.count, period: frequency.period },
        minutesPerRun: row.minutes_per_run,
        peopleCount: row.people_count,
        status: RequestStatusPolicy.statusOf(
            decision,
            row.skill_status === null ? null : SkillStatus.parse(row.skill_status),
        ),
        rejectReason: row.reject_reason,
        skill,
        createdAt: new Date(row.created_at),
    };
}

@Injectable()
export class SlonikRequestQuery extends RequestQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    listByAuthor(authorId: string, page: PageRequest): Promise<Page<RequestView>> {
        return this.list(
            sql.fragment`r.author_id = ${authorId}`,
            sql.fragment`ORDER BY r.created_at DESC, r.id DESC`,
            page,
        );
    }

    listPending(page: PageRequest): Promise<Page<RequestView>> {
        return this.list(
            sql.fragment`r.decision = 'pending'`,
            sql.fragment`ORDER BY r.created_at ASC, r.id ASC`,
            page,
        );
    }

    async findView(id: string): Promise<RequestView | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${SELECT_VIEW} WHERE r.id = ${id}`);
        return row === null ? null : toView(row);
    }

    private async list(
        where: FragmentSqlToken,
        orderBy: FragmentSqlToken,
        page: PageRequest,
    ): Promise<Page<RequestView>> {
        const executor = this.transactions.executor();
        const total = await executor.oneFirst(
            sql.type(z.object({ count: z.number() }))`
                SELECT count(*)::int AS count FROM portal_requests r WHERE ${where}`,
        );
        const rows = await executor.any(sql.unsafe`
            ${SELECT_VIEW} WHERE ${where} ${orderBy}
            LIMIT ${page.limit} OFFSET ${page.page * page.limit}`);
        return { items: rows.map(toView), total };
    }
}
