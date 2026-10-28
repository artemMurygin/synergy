import type { AuditTools } from '../audit-tools';
import type { AuditIssue } from '../value-objects/audit-issue.value-object';
import type { Deal } from '../entities/deal.entity';

export abstract class DealAuditorPort {
    abstract audit(deal: Deal, tools: AuditTools): Promise<AuditIssue[]>;
}
