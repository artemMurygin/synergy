import { CatalogDomainError } from '../errors/catalog-domain.error';
import { type ProgramLevel, parseProgramLevel } from '../value-objects/program-level';
import { type ProgramStatus, parseProgramStatus } from '../value-objects/program-status';
import type { EntranceRequirement } from './entrance-requirement.entity';
import { requireNonBlank } from './guards';
import type { Offer } from './offer.entity';
import type { Price } from './price.entity';

export interface CreateProgramProps {
    id: string;
    organizationId: string;
    level: string;
    title: string;
    facultyId?: string | null;
    directionCode?: string | null;
    profile?: string | null;
    qualification?: string | null;
    isStateFunded?: boolean;
    isAccredited?: boolean;
    status?: string;
    crmName?: string | null;
    crmProductGroup?: string | null;
}

/** Aggregate root: owns offers, prices and entrance requirements. */
export class Program {
    private readonly offerList: Offer[] = [];
    private readonly priceList: Price[] = [];
    private readonly requirementList: EntranceRequirement[] = [];

    private constructor(
        readonly id: string,
        readonly organizationId: string,
        readonly level: ProgramLevel,
        readonly title: string,
        readonly status: ProgramStatus,
        readonly facultyId: string | null,
        readonly directionCode: string | null,
        readonly profile: string | null,
        readonly qualification: string | null,
        readonly isStateFunded: boolean,
        readonly isAccredited: boolean,
        readonly crmName: string | null,
        readonly crmProductGroup: string | null,
    ) {}

    static create(props: CreateProgramProps): Program {
        requireNonBlank('Program id', props.id);
        requireNonBlank('Program organization id', props.organizationId);
        return new Program(
            props.id,
            props.organizationId,
            parseProgramLevel(props.level),
            requireNonBlank('Program title', props.title),
            props.status === undefined ? 'active' : parseProgramStatus(props.status),
            props.facultyId ?? null,
            props.directionCode ?? null,
            props.profile ?? null,
            props.qualification ?? null,
            props.isStateFunded ?? false,
            props.isAccredited ?? true,
            props.crmName ?? null,
            props.crmProductGroup ?? null,
        );
    }

    get offers(): readonly Offer[] {
        return this.offerList;
    }

    get prices(): readonly Price[] {
        return this.priceList;
    }

    get entranceRequirements(): readonly EntranceRequirement[] {
        return this.requirementList;
    }

    addOffer(offer: Offer): void {
        if (offer.programId !== this.id) {
            throw new CatalogDomainError(`Offer ${offer.id} belongs to another program`);
        }
        const key = offer.uniqueKey();
        if (
            this.offerList.some(
                (existing) => existing.id === offer.id || existing.uniqueKey() === key,
            )
        ) {
            throw new CatalogDomainError(
                'Duplicate offer for program, location, study form, base education and tariff',
            );
        }
        this.offerList.push(offer);
    }

    addPrice(price: Price): void {
        if (!this.offerList.some((offer) => offer.id === price.offerId)) {
            throw new CatalogDomainError(
                `Price ${price.id} refers to an unknown offer ${price.offerId}`,
            );
        }
        const key = price.uniqueKey();
        if (
            this.priceList.some(
                (existing) => existing.id === price.id || existing.uniqueKey() === key,
            )
        ) {
            throw new CatalogDomainError('Duplicate price for offer, kind and condition');
        }
        this.priceList.push(price);
    }

    addEntranceRequirement(requirement: EntranceRequirement): void {
        if (requirement.programId !== this.id) {
            throw new CatalogDomainError(
                `Entrance requirement ${requirement.id} belongs to another program`,
            );
        }
        const key = requirement.uniqueKey();
        if (
            this.requirementList.some(
                (existing) => existing.id === requirement.id || existing.uniqueKey() === key,
            )
        ) {
            throw new CatalogDomainError(
                'Duplicate entrance requirement for program, base education and subject',
            );
        }
        this.requirementList.push(requirement);
    }
}
