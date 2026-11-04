import { CatalogDomainError } from '../errors/catalog-domain.error';
import { Money } from '../value-objects/money';
import { type PriceKind, parsePriceKind } from '../value-objects/price-kind';
import { requireNonBlank } from './guards';

export interface CreatePriceProps {
    id: string;
    offerId: string;
    kind: string;
    amount: number;
    currency: string;
    condition?: string | null;
}

export class Price {
    private constructor(
        readonly id: string,
        readonly offerId: string,
        readonly kind: PriceKind,
        readonly money: Money,
        readonly condition: string | null,
    ) {}

    static create({ id, offerId, kind, amount, currency, condition }: CreatePriceProps): Price {
        requireNonBlank('Price id', id);
        requireNonBlank('Price offer id', offerId);
        const priceKind = parsePriceKind(kind);
        const normalized = condition ?? null;
        if (priceKind === 'discounted' && (normalized === null || normalized.trim() === '')) {
            throw new CatalogDomainError('Discounted price requires a condition');
        }
        return new Price(id, offerId, priceKind, Money.create(amount, currency), normalized);
    }

    /** Price is unique per offer, kind and condition. */
    uniqueKey(): string {
        return JSON.stringify([this.offerId, this.kind, this.condition]);
    }
}
