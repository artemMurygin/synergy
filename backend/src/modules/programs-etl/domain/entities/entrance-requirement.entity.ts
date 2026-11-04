import { CatalogDomainError } from '../errors/catalog-domain.error';
import { type BaseEducation, parseBaseEducation } from '../value-objects/base-education';
import { requireNonBlank } from './guards';

export interface CreateEntranceRequirementProps {
    id: string;
    programId: string;
    baseEducation: string;
    subject: string;
    minScore?: number | null;
    isRequired?: boolean;
}

export class EntranceRequirement {
    private constructor(
        readonly id: string,
        readonly programId: string,
        readonly baseEducation: BaseEducation,
        readonly subject: string,
        readonly minScore: number | null,
        readonly isRequired: boolean,
    ) {}

    static create(props: CreateEntranceRequirementProps): EntranceRequirement {
        requireNonBlank('Entrance requirement id', props.id);
        requireNonBlank('Entrance requirement program id', props.programId);
        const minScore = props.minScore ?? null;
        if (minScore !== null && (!Number.isInteger(minScore) || minScore < 0)) {
            throw new CatalogDomainError(
                `Minimum score must be a non-negative integer: ${String(minScore)}`,
            );
        }
        return new EntranceRequirement(
            props.id,
            props.programId,
            parseBaseEducation(props.baseEducation),
            requireNonBlank('Entrance requirement subject', props.subject),
            minScore,
            props.isRequired ?? true,
        );
    }

    /** Requirement is unique per program, base education and subject. */
    uniqueKey(): string {
        return JSON.stringify([this.programId, this.baseEducation, this.subject]);
    }
}
