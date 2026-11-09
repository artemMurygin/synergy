import type { AuditIssue } from '../value-objects/audit-issue.value-object';
import type { Deal } from '../entities/deal.entity';

export abstract class DealAuditorPort {
    abstract audit(deal: Deal): Promise<AuditIssue[]>;
}
