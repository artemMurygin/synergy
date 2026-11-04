import { type BaseEducation, parseBaseEducation } from '../value-objects/base-education';
import { type StudyForm, parseStudyForm } from '../value-objects/study-form';
import { type Tariff, parseTariff } from '../value-objects/tariff';
import { requireNonBlank, requireOptionalPositiveInt } from './guards';

export interface CreateOfferProps {
    id: string;
    programId: string;
    locationId?: string | null;
    studyForm: string;
    baseEducation: string;
    tariff?: string | null;
    schedule?: string | null;
    durationMonths?: number | null;
    hours?: number | null;
    startDate?: Date | null;
    enrollUntil?: Date | null;
    validTo?: Date | null;
    notes?: string | null;
}

export class Offer {
    private constructor(
        readonly id: string,
        readonly programId: string,
        readonly locationId: string | null,
        readonly studyForm: StudyForm,
        readonly baseEducation: BaseEducation,
        readonly tariff: Tariff | null,
        readonly schedule: string | null,
        readonly durationMonths: number | null,
        readonly hours: number | null,
        readonly startDate: Date | null,
        readonly enrollUntil: Date | null,
        readonly validTo: Date | null,
        readonly notes: string | null,
    ) {}

    static create(props: CreateOfferProps): Offer {
        requireNonBlank('Offer id', props.id);
        requireNonBlank('Offer program id', props.programId);
        return new Offer(
            props.id,
            props.programId,
            props.locationId ?? null,
            parseStudyForm(props.studyForm),
            parseBaseEducation(props.baseEducation),
            props.tariff === null || props.tariff === undefined ? null : parseTariff(props.tariff),
            props.schedule ?? null,
            requireOptionalPositiveInt('Offer duration months', props.durationMonths),
            requireOptionalPositiveInt('Offer hours', props.hours),
            props.startDate ?? null,
            props.enrollUntil ?? null,
            props.validTo ?? null,
            props.notes ?? null,
        );
    }

    /** Offer is unique per program, location, study form, base education and tariff. */
    uniqueKey(): string {
        return JSON.stringify([
            this.programId,
            this.locationId,
            this.studyForm,
            this.baseEducation,
            this.tariff,
        ]);
    }
}
