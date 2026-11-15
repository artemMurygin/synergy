import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { BugDescription } from '../domain/bug-description';
import { BugReport } from '../domain/bug-report';
import { BUG_STATUSES, type BugStatus } from '../domain/bug-status';
import { BugTitle } from '../domain/bug-title';
import { BugRepository } from '../domain/ports/bug-repository.port';
import { WontFixReason } from '../domain/wont-fix-reason';
import { millis, UUID_PATTERN } from './sql-helpers';

const bugRow = z.object({
    id: z.string(),
    author_id: z.string(),
    product_id: z.string(),
    agent_id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(BUG_STATUSES),
    wont_fix_reason: z.string().nullable(),
    status_changed_by: z.string().nullable(),
    created_at: z.number(),
    status_changed_at: z.number(),
});

@Injectable()
export class SlonikBugRepository extends BugRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async insert(bug: BugReport): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO portal_bugs
                (id, author_id, product_id, agent_id, title, description, status,
                 wont_fix_reason, status_changed_by, created_at, status_changed_at)
            VALUES (${bug.id}, ${bug.authorId}, ${bug.productId}, ${bug.agentId},
                    ${bug.title.value}, ${bug.description.value}, ${bug.status},
                    ${bug.wontFixReason?.value ?? null}, ${bug.statusChangedBy},
                    ${sql.timestamp(bug.createdAt)}, ${sql.timestamp(bug.statusChangedAt)})`);
    }

    async findById(id: string): Promise<BugReport | null> {
        if (!UUID_PATTERN.test(id)) return null;
        const raw = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, author_id, product_id, agent_id, title, description, status,
                   wont_fix_reason, status_changed_by,
                   ${millis('created_at', 'created_at')},
                   ${millis('status_changed_at', 'status_changed_at')}
            FROM portal_bugs WHERE id = ${id}`);
        if (raw === null) return null;
        const row = bugRow.parse(raw);
        return BugReport.restore({
            id: row.id,
            authorId: row.author_id,
            productId: row.product_id,
            agentId: row.agent_id,
            title: BugTitle.of(row.title),
            description: BugDescription.of(row.description),
            status: row.status,
            wontFixReason:
                row.wont_fix_reason === null ? null : WontFixReason.of(row.wont_fix_reason),
            statusChangedBy: row.status_changed_by,
            createdAt: new Date(row.created_at),
            statusChangedAt: new Date(row.status_changed_at),
        });
    }

    async updateStatus(bug: BugReport, expected: BugStatus): Promise<boolean> {
        const result = await this.transactions.executor().query(sql.unsafe`
            UPDATE portal_bugs
            SET status = ${bug.status},
                wont_fix_reason = ${bug.wontFixReason?.value ?? null},
                status_changed_by = ${bug.statusChangedBy},
                status_changed_at = ${sql.timestamp(bug.statusChangedAt)}
            WHERE id = ${bug.id} AND status = ${expected}`);
        return result.rowCount > 0;
    }
}
