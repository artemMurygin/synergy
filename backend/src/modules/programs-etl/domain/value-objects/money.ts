import { CatalogDomainError } from '../errors/catalog-domain.error';
import { parseClosedSet } from './closed-set';

export const CURRENCIES = ['RUB', 'USD', 'EUR'] as const;

export type Currency = (typeof CURRENCIES)[number];

export class Money {
    private constructor(
        readonly amount: number,
        readonly currency: Currency,
    ) {
        Object.freeze(this);
    }

    static create(amount: number, currency: string): Money {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new CatalogDomainError(
                `Money amount must be a non-negative number: ${String(amount)}`,
            );
        }
        return new Money(amount, parseClosedSet('currency', CURRENCIES, currency));
    }

    equals(other: Money): boolean {
        return this.amount === other.amount && this.currency === other.currency;
    }
}
