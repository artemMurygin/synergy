import { Injectable } from '@nestjs/common';
import { sql, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import type { Page, PageRequest } from '../domain/ports/page';
import { SkillQuery, type SkillView } from '../domain/ports/skill-query.port';
import { SkillStatus } from '../domain/skill-status';
import { millis } from './sql-helpers';

const viewRow = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    status: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
    product_id: z.string(),
    product_name: z.string(),
    linked_request_count: z.number(),
    created_at: z.number(),
    status_changed_at: z.number(),
});

const SELECT_VIEW = sql.fragment`
    SELECT s.id, s.name, s.description, s.status,
           a.id AS agent_id, a.name AS agent_name, p.id AS product_id, p.name AS product_name,
           (SELECT count(*)::int FROM portal_requests r
             WHERE r.skill_id = s.id AND r.decision = 'accepted') AS linked_request_count,
           ${millis('s.created_at', 'created_at')},
           ${millis('s.status_changed_at', 'status_changed_at')}
    FROM portal_skills s
    JOIN portal_agents a ON a.id = s.agent_id
    JOIN portal_products p ON p.id = a.product_id`;

function toView(raw: unknown): SkillView {
    const row = viewRow.parse(raw);
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        status: SkillStatus.parse(row.status),
        agent: { id: row.agent_id, name: row.agent_name },
        product: { id: row.product_id, name: row.product_name },
        linkedRequestCount: row.linked_request_count,
        createdAt: new Date(row.created_at),
        statusChangedAt: new Date(row.status_changed_at),
    };
}

@Injectable()
export class SlonikSkillQuery extends SkillQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async list(filter: { status?: SkillStatus }, page: PageRequest): Promise<Page<SkillView>> {
        const where: FragmentSqlToken =
            filter.status === undefined
                ? sql.fragment`TRUE`
                : sql.fragment`s.status = ${filter.status}`;
        const executor = this.transactions.executor();
        const total = await executor.oneFirst(
            sql.type(z.object({ count: z.number() }))`
                SELECT count(*)::int AS count FROM portal_skills s WHERE ${where}`,
        );
        const rows = await executor.any(sql.unsafe`
            ${SELECT_VIEW} WHERE ${where}
            ORDER BY s.status_changed_at DESC, s.id DESC
            LIMIT ${page.limit} OFFSET ${page.page * page.limit}`);
        return { items: rows.map(toView), total };
    }

    async findView(id: string): Promise<SkillView | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${SELECT_VIEW} WHERE s.id = ${id}`);
        return row === null ? null : toView(row);
    }
}
