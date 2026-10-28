import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../../database/postgres/database.constants';
import { AuditIssue } from '../../domain/value-objects/audit-issue.value-object';
import { parseAuditVerdict } from '../../domain/value-objects/audit-verdict';
import { DealAuditRepositoryPort } from '../../domain/ports/deal-audit-repository.port';
import { DealAudit } from '../../domain/aggregates/deal-audit.aggregate';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import type { SqlExecutor } from './sql-executor';

const dealAuditRowSchema = z.object({
    id: z.string(),
    deal_id: z.string(),
    deal_updated_at: z.coerce.date(),
    verdict: z.string(),
    issues: z.array(z.object({ field: z.string(), reason: z.string() })),
    audited_at: z.coerce.date(),
});

@Injectable()
export class DealAuditRepository extends DealAuditRepositoryPort {
    constructor(@Inject(PG_POOL) private readonly executor: SqlExecutor) {
        super();
    }

    async findByVersion(dealId: DealId, dealUpdatedAt: Date): Promise<DealAudit | null> {
        const row = await this.executor.maybeOne(sql.unsafe`
            SELECT id, deal_id, deal_updated_at, verdict, issues, audited_at
            FROM deal_audit
            WHERE deal_id = ${dealId.value} AND deal_updated_at = ${dealUpdatedAt.toISOString()}::timestamptz
        `);
        return this.toEntity(row);
    }

    async save(audit: DealAudit): Promise<void> {
        const issues = audit.issues.map((issue) => ({ field: issue.field, reason: issue.reason }));
        await this.executor.query(sql.unsafe`
            INSERT INTO deal_audit (id, deal_id, deal_updated_at, verdict, issues, audited_at)
            VALUES (
                ${audit.id},
                ${audit.dealId.value},
                ${audit.dealUpdatedAt.toISOString()}::timestamptz,
                ${audit.verdict},
                ${sql.jsonb(issues)},
                ${audit.auditedAt.toISOString()}::timestamptz
            )
            ON CONFLICT (deal_id, deal_updated_at) DO NOTHING
        `);
    }

    private toEntity(rawRow: unknown): DealAudit | null {
        const row = dealAuditRowSchema.nullable().parse(rawRow);
        if (row === null) {
            return null;
        }
        return DealAudit.create({
            id: row.id,
            dealId: new DealId(row.deal_id),
            dealUpdatedAt: row.deal_updated_at,
            verdict: parseAuditVerdict(row.verdict),
            issues: row.issues.map((issue) => new AuditIssue(issue)),
            auditedAt: row.audited_at,
        });
    }
}
