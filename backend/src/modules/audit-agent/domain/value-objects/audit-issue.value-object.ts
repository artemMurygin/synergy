import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { parseRequiredField, type RequiredField } from './required-field';

export interface AuditIssueProps {
    field: string;
    reason: string;
}

interface AuditIssueState {
    field: RequiredField;
    reason: string;
}

export class AuditIssue extends ValueObject<AuditIssueState> {
    constructor({ field, reason }: AuditIssueProps) {
        super({ field: parseRequiredField(field), reason });
        Object.freeze(this);
    }

    get field(): RequiredField {
        return this.props.field;
    }

    get reason(): string {
        return this.props.reason;
    }

    protected validate({ reason }: AuditIssueState): void {
        if (reason.trim() === '') {
            throw new ArgumentInvalidError('Audit issue reason must not be blank');
        }
    }
}
