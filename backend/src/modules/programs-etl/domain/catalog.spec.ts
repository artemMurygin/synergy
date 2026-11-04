import { describe, expect, it } from 'vitest';
import { EntranceRequirement } from './entities/entrance-requirement.entity';
import { Offer } from './entities/offer.entity';
import { Organization } from './entities/organization.entity';
import { Price } from './entities/price.entity';
import { Program } from './entities/program.entity';
import { CatalogDomainError } from './errors/catalog-domain.error';
import { type BaseEducation, parseBaseEducation } from './value-objects/base-education';
import { Money } from './value-objects/money';
import { parsePriceKind } from './value-objects/price-kind';
import { parseProgramLevel } from './value-objects/program-level';
import { parseProgramStatus } from './value-objects/program-status';
import { parseStudyForm } from './value-objects/study-form';

describe('closed-set value objects', () => {
    it.each([
        ['spo', 'spo'],
        ['bachelor', 'bachelor'],
        ['specialist', 'specialist'],
        ['master', 'master'],
        ['postgrad', 'postgrad'],
        ['dpo_pp', 'dpo_pp'],
        ['dpo_pk', 'dpo_pk'],
        ['short_course', 'short_course'],
        ['kids', 'kids'],
        ['camp', 'camp'],
    ])('accepts program level %s', (value, expected) => {
        expect(parseProgramLevel(value)).toBe(expected);
    });

    it('accepts every program status', () => {
        for (const status of ['active', 'enrollment_closed', 'new']) {
            expect(parseProgramStatus(status)).toBe(status);
        }
    });

    it('accepts every study form', () => {
        for (const form of [
            'full_time',
            'mixed',
            'extramural',
            'distance',
            'distance_tutor',
            'online',
        ]) {
            expect(parseStudyForm(form)).toBe(form);
        }
    });

    it('accepts every base education', () => {
        for (const base of ['grade9', 'grade11', 'spo', 'vo', 'any']) {
            expect(parseBaseEducation(base)).toBe(base);
        }
    });

    it('accepts every price kind', () => {
        for (const kind of [
            'first_year',
            'next_year',
            'total',
            'installment',
            'lump_sum',
            'site_price',
            'discounted',
        ]) {
            expect(parsePriceKind(kind)).toBe(kind);
        }
    });

    it.each([
        ['level', parseProgramLevel],
        ['status', parseProgramStatus],
        ['study form', parseStudyForm],
        ['base education', parseBaseEducation],
        ['price kind', parsePriceKind],
    ])('rejects unknown %s', (_name, parse) => {
        expect(() => parse('unknown')).toThrow(CatalogDomainError);
    });
});

describe('Money', () => {
    it('keeps amount and currency', () => {
        const money = Money.create(1500.5, 'RUB');
        expect(money.amount).toBe(1500.5);
        expect(money.currency).toBe('RUB');
    });

    it('allows zero', () => {
        expect(Money.create(0, 'USD').amount).toBe(0);
    });

    it('rejects negative, non-finite amounts and unsupported currency', () => {
        expect(() => Money.create(-1, 'RUB')).toThrow(CatalogDomainError);
        expect(() => Money.create(Number.NaN, 'RUB')).toThrow(CatalogDomainError);
        expect(() => Money.create(Number.POSITIVE_INFINITY, 'RUB')).toThrow(CatalogDomainError);
        expect(() => Money.create(10, 'GBP')).toThrow(CatalogDomainError);
    });

    it('compares by value', () => {
        expect(Money.create(10, 'EUR').equals(Money.create(10, 'EUR'))).toBe(true);
        expect(Money.create(10, 'EUR').equals(Money.create(10, 'RUB'))).toBe(false);
    });
});

describe('Organization', () => {
    it('is identified by id and holds kind, name and parent', () => {
        const organization = Organization.create({
            id: 'o1',
            kind: 'branch',
            name: 'Филиал',
            parentId: 'o0',
        });
        expect(organization.id).toBe('o1');
        expect(organization.kind).toBe('branch');
        expect(organization.parentId).toBe('o0');
    });

    it('has no parent by default', () => {
        expect(
            Organization.create({ id: 'o1', kind: 'university', name: 'U' }).parentId,
        ).toBeNull();
    });

    it('rejects unknown kind, blank name and self-parent', () => {
        expect(() => Organization.create({ id: 'o1', kind: 'bank', name: 'U' })).toThrow(
            CatalogDomainError,
        );
        expect(() => Organization.create({ id: 'o1', kind: 'school', name: ' ' })).toThrow(
            CatalogDomainError,
        );
        expect(() =>
            Organization.create({ id: 'o1', kind: 'school', name: 'S', parentId: 'o1' }),
        ).toThrow(CatalogDomainError);
    });
});

const offerProps = {
    id: 'of1',
    programId: 'p1',
    locationId: null,
    studyForm: 'full_time',
    baseEducation: 'grade11',
    tariff: null,
};

describe('Offer', () => {
    it('validates classifiers and exposes its uniqueness key', () => {
        const offer = Offer.create(offerProps);
        expect(offer.studyForm).toBe('full_time');
        expect(offer.baseEducation).toBe('grade11');
        expect(offer.uniqueKey()).toBe(Offer.create({ ...offerProps, id: 'other' }).uniqueKey());
        expect(offer.uniqueKey()).not.toBe(
            Offer.create({ ...offerProps, id: 'x', tariff: 'base' }).uniqueKey(),
        );
    });

    it('rejects unknown classifiers, tariff and non-positive duration/hours', () => {
        expect(() => Offer.create({ ...offerProps, studyForm: 'x' })).toThrow(CatalogDomainError);
        expect(() => Offer.create({ ...offerProps, baseEducation: 'x' })).toThrow(
            CatalogDomainError,
        );
        expect(() => Offer.create({ ...offerProps, tariff: 'gold' })).toThrow(CatalogDomainError);
        expect(() => Offer.create({ ...offerProps, durationMonths: 0 })).toThrow(
            CatalogDomainError,
        );
        expect(() => Offer.create({ ...offerProps, hours: -5 })).toThrow(CatalogDomainError);
    });
});

describe('Price', () => {
    const base = { id: 'pr1', offerId: 'of1', kind: 'first_year', amount: 100, currency: 'RUB' };

    it('holds a non-negative money value', () => {
        const price = Price.create(base);
        expect(price.money.equals(Money.create(100, 'RUB'))).toBe(true);
        expect(price.kind).toBe('first_year');
        expect(price.condition).toBeNull();
    });

    it('rejects negative amount', () => {
        expect(() => Price.create({ ...base, amount: -0.01 })).toThrow(CatalogDomainError);
    });

    it('requires a condition for discounted prices', () => {
        expect(() => Price.create({ ...base, kind: 'discounted' })).toThrow(CatalogDomainError);
        expect(() => Price.create({ ...base, kind: 'discounted', condition: '  ' })).toThrow(
            CatalogDomainError,
        );
        expect(
            Price.create({ ...base, kind: 'discounted', condition: 'до 1 июня' }).condition,
        ).toBe('до 1 июня');
    });
});

describe('EntranceRequirement', () => {
    const base = {
        id: 'r1',
        programId: 'p1',
        baseEducation: 'grade11',
        subject: 'Математика',
        minScore: 40,
    };

    it('holds subject and minimum score', () => {
        const requirement = EntranceRequirement.create(base);
        expect(requirement.minScore).toBe(40);
        expect(requirement.isRequired).toBe(true);
    });

    it('rejects negative score, blank subject and unknown base education', () => {
        expect(() => EntranceRequirement.create({ ...base, minScore: -1 })).toThrow(
            CatalogDomainError,
        );
        expect(() => EntranceRequirement.create({ ...base, subject: '' })).toThrow(
            CatalogDomainError,
        );
        expect(() => EntranceRequirement.create({ ...base, baseEducation: 'x' })).toThrow(
            CatalogDomainError,
        );
    });

    it('allows absent minimum score', () => {
        expect(EntranceRequirement.create({ ...base, minScore: null }).minScore).toBeNull();
    });
});

describe('Program aggregate', () => {
    const create = (): Program =>
        Program.create({
            id: 'p1',
            organizationId: 'o1',
            level: 'bachelor',
            title: 'Юриспруденция',
            directionCode: '40.03.01',
        });

    it('defaults status to active and exposes catalog attributes', () => {
        const program = create();
        expect(program.status).toBe('active');
        expect(program.level).toBe('bachelor');
        expect(program.directionCode).toBe('40.03.01');
        expect(program.profile).toBeNull();
    });

    it('rejects unknown level/status and blank title', () => {
        const props = { id: 'p1', organizationId: 'o1', level: 'bachelor', title: 'T' };
        expect(() => Program.create({ ...props, level: 'x' })).toThrow(CatalogDomainError);
        expect(() => Program.create({ ...props, status: 'x' })).toThrow(CatalogDomainError);
        expect(() => Program.create({ ...props, title: ' ' })).toThrow(CatalogDomainError);
    });

    it('adds an offer and prices to it', () => {
        const program = create();
        program.addOffer(Offer.create(offerProps));
        program.addPrice(
            Price.create({ id: 'pr1', offerId: 'of1', kind: 'total', amount: 5, currency: 'RUB' }),
        );
        expect(program.offers).toHaveLength(1);
        expect(program.prices).toHaveLength(1);
    });

    it('rejects a duplicate offer by location, form, base education and tariff', () => {
        const program = create();
        program.addOffer(Offer.create(offerProps));
        expect(() => {
            program.addOffer(Offer.create({ ...offerProps, id: 'of2' }));
        }).toThrow(CatalogDomainError);
        expect(() => {
            program.addOffer(Offer.create({ ...offerProps, id: 'of3', tariff: 'base' }));
        }).not.toThrow();
    });

    it('rejects an offer of another program', () => {
        expect(() => {
            create().addOffer(Offer.create({ ...offerProps, programId: 'other' }));
        }).toThrow(CatalogDomainError);
    });

    it('rejects a price for an unknown offer and a duplicate price kind/condition', () => {
        const program = create();
        program.addOffer(Offer.create(offerProps));
        const price = { offerId: 'of1', kind: 'total', amount: 5, currency: 'RUB' };
        expect(() => {
            program.addPrice(Price.create({ ...price, id: 'a', offerId: 'nope' }));
        }).toThrow(CatalogDomainError);
        program.addPrice(Price.create({ ...price, id: 'a' }));
        expect(() => {
            program.addPrice(Price.create({ ...price, id: 'b' }));
        }).toThrow(CatalogDomainError);
    });

    it('rejects a duplicate entrance requirement by base education and subject', () => {
        const program = create();
        const requirement = {
            programId: 'p1',
            baseEducation: 'grade11' as BaseEducation,
            subject: 'Русский',
            minScore: 1,
        };
        program.addEntranceRequirement(EntranceRequirement.create({ ...requirement, id: 'r1' }));
        expect(() => {
            program.addEntranceRequirement(
                EntranceRequirement.create({ ...requirement, id: 'r2' }),
            );
        }).toThrow(CatalogDomainError);
        expect(() => {
            program.addEntranceRequirement(
                EntranceRequirement.create({ ...requirement, id: 'r3', baseEducation: 'spo' }),
            );
        }).not.toThrow();
        expect(() => {
            program.addEntranceRequirement(
                EntranceRequirement.create({ ...requirement, id: 'r4', programId: 'zzz' }),
            );
        }).toThrow(CatalogDomainError);
    });
});
