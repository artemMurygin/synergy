import { AggregateRoot } from '../../../shared/ddd';
import { ArgumentInvalidError } from '../../../shared/errors';
import {
    RequestAlreadyDecidedError,
    RequestAlreadyTakenError,
    RequestNotTakenError,
} from './errors';
import { RejectReason } from './reject-reason';
import { RequestDecision, type RequestStatusKind } from './request-decision';
import type { EffortHours } from './effort-hours';
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
                decision: RequestDecision.new(),
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

    get statusKind(): RequestStatusKind {
        return this.props.decision.kind;
    }

    /** Взять в работу: только из `new`. */
    take(by: string, now: Date): void {
        const decision = this.props.decision;
        if (decision.kind === 'under_review') throw new RequestAlreadyTakenError(this.id);
        if (decision.kind !== 'new') throw new RequestAlreadyDecidedError(this.id);
        this.props.decision = RequestDecision.underReview(by, now);
        this.touch();
    }

    /** Принять в навык с оценкой: только из `under_review`; решать может не взявший. */
    accept(skillId: string, effort: EffortHours, by: string, now: Date): void {
        if (skillId.length === 0) {
            throw new InvalidIdeaRequestError('Accepted request must reference a skill');
        }
        const taken = this.assertUnderReview();
        this.props.decision = RequestDecision.accepted(
            taken.reviewerId,
            taken.takenAt,
            skillId,
            effort.value,
            by,
            now,
        );
        this.touch();
    }

    /** Отклонить с обязательной причиной: только из `under_review`. */
    reject(reason: string, by: string, now: Date): void {
        const validReason = RejectReason.of(reason);
        const taken = this.assertUnderReview();
        this.props.decision = RequestDecision.rejected(
            taken.reviewerId,
            taken.takenAt,
            validReason.value,
            by,
            now,
        );
        this.touch();
    }

    /** Проверка до побочных эффектов: решать можно только заявку `under_review`. */
    ensureUnderReview(): void {
        this.assertUnderReview();
    }

    validate(): void {
        if (this.props.description.trim().length === 0) {
            throw new InvalidIdeaRequestError('Request description must not be empty');
        }
        assertPositiveInteger(this.props.minutesPerRun, 'minutesPerRun');
        assertPositiveInteger(this.props.peopleCount, 'peopleCount');
    }

    private assertUnderReview(): { reviewerId: string; takenAt: Date } {
        const decision = this.props.decision;
        if (decision.kind === 'under_review') return decision;
        if (decision.kind === 'new') throw new RequestNotTakenError(this.id);
        throw new RequestAlreadyDecidedError(this.id);
    }
}

function assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new InvalidIdeaRequestError(`${field} must be a positive integer`);
    }
}
