import { AggregateRoot } from '../../../shared/ddd';
import { ArgumentInvalidError } from '../../../shared/errors';
import { RequestAlreadyDecidedError } from './errors';
import { RejectReason } from './reject-reason';
import { RequestDecision } from './request-decision';
import type { Frequency } from './frequency';
import type { RequestTitle } from './request-title';

export class InvalidIdeaRequestError extends ArgumentInvalidError {}

export interface IdeaRequestProps {
    authorId: string;
    title: RequestTitle;
    description: string;
    frequency: Frequency;
    minutesPerRun: number;
    peopleCount: number;
    decision: RequestDecision;
}

export interface CreateIdeaRequestInput {
    id: string;
    authorId: string;
    title: RequestTitle;
    description: string;
    frequency: Frequency;
    minutesPerRun: number;
    peopleCount: number;
    now: Date;
}

export interface RestoreIdeaRequestInput extends IdeaRequestProps {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

/** Заявка на автоматизацию. Статус «для автора» не хранит: он выводится политикой. */
export class IdeaRequest extends AggregateRoot<IdeaRequestProps> {
    static create(input: CreateIdeaRequestInput): IdeaRequest {
        return new IdeaRequest({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                authorId: input.authorId,
                title: input.title,
                description: input.description,
                frequency: input.frequency,
                minutesPerRun: input.minutesPerRun,
                peopleCount: input.peopleCount,
                decision: RequestDecision.pending(),
            },
        });
    }

    static restore({ id, createdAt, updatedAt, ...props }: RestoreIdeaRequestInput): IdeaRequest {
        return new IdeaRequest({ id, createdAt, updatedAt, props: { ...props } });
    }

    get authorId(): string {
        return this.props.authorId;
    }

    get title(): RequestTitle {
        return this.props.title;
    }

    get description(): string {
        return this.props.description;
    }

    get frequency(): Frequency {
        return this.props.frequency;
    }

    get minutesPerRun(): number {
        return this.props.minutesPerRun;
    }

    get peopleCount(): number {
        return this.props.peopleCount;
    }

    get decision(): RequestDecision {
        return this.props.decision;
    }

    /** Принять в навык: только из `pending`. */
    accept(skillId: string, by: string, now: Date): void {
        if (skillId.length === 0) {
            throw new InvalidIdeaRequestError('Accepted request must reference a skill');
        }
        this.assertPending();
        this.props.decision = RequestDecision.accepted(skillId, by, now);
        this.touch();
    }

    /** Отклонить с обязательной причиной: только из `pending`. */
    reject(reason: string, by: string, now: Date): void {
        const validReason = RejectReason.of(reason);
        this.assertPending();
        this.props.decision = RequestDecision.rejected(validReason.value, by, now);
        this.touch();
    }

    validate(): void {
        if (this.props.description.trim().length === 0) {
            throw new InvalidIdeaRequestError('Request description must not be empty');
        }
        assertPositiveInteger(this.props.minutesPerRun, 'minutesPerRun');
        assertPositiveInteger(this.props.peopleCount, 'peopleCount');
    }

    private assertPending(): void {
        if (this.props.decision.kind !== 'pending') {
            throw new RequestAlreadyDecidedError(this.id);
        }
    }
}

function assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new InvalidIdeaRequestError(`${field} must be a positive integer`);
    }
}
