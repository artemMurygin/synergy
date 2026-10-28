import type { DealAudit } from '../aggregates/deal-audit.aggregate';
import type { DealId } from '../value-objects/deal-id.value-object';

export abstract class DealAuditRepositoryPort {
    abstract findByVersion(dealId: DealId, dealUpdatedAt: Date): Promise<DealAudit | null>;

    abstract save(audit: DealAudit): Promise<void>;
}
