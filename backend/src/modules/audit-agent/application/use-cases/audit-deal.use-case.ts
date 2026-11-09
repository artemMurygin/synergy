import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { AuditVerdict } from '../../domain/value-objects/audit-verdict';
import { AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import { CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import { DealAudit } from '../../domain/aggregates/deal-audit.aggregate';
import { DealAuditRepositoryPort } from '../../domain/ports/deal-audit-repository.port';
import { DealAuditorPort } from '../../domain/ports/deal-auditor.port';
import type { DealId } from '../../domain/value-objects/deal-id.value-object';
import { DealNotFoundError } from '../../domain/errors/deal-not-found.error';
import type { Deal } from '../../domain/entities/deal.entity';

export type AuditDealResult =
    | { status: 'audited'; verdict: AuditVerdict }
    | { status: 'already-audited' }
    | { status: 'skipped'; reason: string };

export const DEAL_NOT_FOUND_REASON = 'deal not found';

@Injectable()
export class AuditDealUseCase {
    constructor(
        private readonly crmGateway: CrmGatewayPort,
        private readonly auditRepository: DealAuditRepositoryPort,
        private readonly auditor: DealAuditorPort,
        private readonly logger: PinoLogger,
        private readonly metrics: AuditMetricsPort,
    ) {
        this.logger.setContext(AuditDealUseCase.name);
    }

    async execute(dealId: DealId, now: Date = new Date()): Promise<AuditDealResult> {
        const deal = await this.findDeal(dealId);
        if (deal === null) {
            this.logger.warn({ dealId: dealId.value }, 'Audit skipped: deal not found');
            this.metrics.recordAudit('skipped');
            return { status: 'skipped', reason: DEAL_NOT_FOUND_REASON };
        }
        const existing = await this.auditRepository.findByVersion(dealId, deal.updatedAt);
        if (existing !== null) {
            this.logger.info({ dealId: dealId.value }, 'Audit skipped: version already audited');
            this.metrics.recordAudit('skipped');
            return { status: 'already-audited' };
        }
        const issues = await this.auditor.audit(deal);
        const verdict: AuditVerdict = issues.length === 0 ? 'ok' : 'violations';
        await this.auditRepository.save(
            DealAudit.create({
                id: randomUUID(),
                dealId,
                dealUpdatedAt: deal.updatedAt,
                verdict,
                issues,
                auditedAt: now,
            }),
        );
        this.logger.info(
            { dealId: dealId.value, verdict, issueCount: issues.length },
            'Audit completed',
        );
        this.metrics.recordAudit(verdict);
        return { status: 'audited', verdict };
    }

    private async findDeal(dealId: DealId): Promise<Deal | null> {
        try {
            return await this.crmGateway.getDeal(dealId);
        } catch (err: unknown) {
            if (err instanceof DealNotFoundError) {
                return null;
            }
            throw err;
        }
    }
}
