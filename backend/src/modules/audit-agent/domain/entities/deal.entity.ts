import { Entity } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { DealId } from '../value-objects/deal-id.value-object';

export interface DealProps {
    clientName: string | null;
    phone: string | null;
    program: string | null;
    studyForm: string | null;
    leadSource: string | null;
    pipelineStage: string | null;
    responsibleId: string;
}

export interface CreateDealProps extends DealProps {
    id: DealId;
    updatedAt: Date;
}

export class Deal extends Entity<DealProps> {
    static create({ id, updatedAt, ...props }: CreateDealProps): Deal {
        return new Deal({ id: id.value, props, updatedAt });
    }

    get dealId(): DealId {
        return new DealId(this.id);
    }

    get clientName(): string | null {
        return this.props.clientName;
    }

    get phone(): string | null {
        return this.props.phone;
    }

    get program(): string | null {
        return this.props.program;
    }

    get studyForm(): string | null {
        return this.props.studyForm;
    }

    get leadSource(): string | null {
        return this.props.leadSource;
    }

    get pipelineStage(): string | null {
        return this.props.pipelineStage;
    }

    get responsibleId(): string {
        return this.props.responsibleId;
    }

    validate(): void {
        if (this.props.responsibleId.trim() === '') {
            throw new ArgumentInvalidError('Deal responsible id must not be blank');
        }
    }
}
