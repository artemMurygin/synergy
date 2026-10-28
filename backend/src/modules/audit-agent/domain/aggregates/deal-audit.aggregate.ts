import { AggregateRoot } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';
import type { AuditIssue } from '../value-objects/audit-issue.value-object';
import type { AuditVerdict } from '../value-objects/audit-verdict';
import type { DealId } from '../value-objects/deal-id.value-object';

export interface DealAuditProps {
    dealId: DealId;
    dealUpdatedAt: Date;
    verdict: AuditVerdict;
    issues: readonly AuditIssue[];
    auditedAt: Date;
}

export interface CreateDealAuditProps extends DealAuditProps {
    id: string;
}

export class DealAudit extends AggregateRoot<DealAuditProps> {
    static create({ id, ...props }: CreateDealAuditProps): DealAudit {
        return new DealAudit({
            id,
            props: { ...props, issues: Object.freeze([...props.issues]) },
            createdAt: props.auditedAt,
            updatedAt: props.auditedAt,
        });
    }

    get dealId(): DealId {
        return this.props.dealId;
    }

    get dealUpdatedAt(): Date {
        return this.props.dealUpdatedAt;
    }

    get verdict(): AuditVerdict {
        return this.props.verdict;
    }

    get issues(): readonly AuditIssue[] {
        return this.props.issues;
    }

    get auditedAt(): Date {
        return this.props.auditedAt;
    }

    validate(): void {
        if (this.props.verdict === 'ok' && this.props.issues.length > 0) {
            throw new ArgumentInvalidError('Audit with verdict ok must not have issues');
        }
    }
}
