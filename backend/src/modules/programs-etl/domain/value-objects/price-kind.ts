import { parseClosedSet } from './closed-set';

export const PRICE_KINDS = [
    'first_year',
    'next_year',
    'total',
    'installment',
    'lump_sum',
    'site_price',
    'discounted',
] as const;

export type PriceKind = (typeof PRICE_KINDS)[number];

export function parsePriceKind(value: string): PriceKind {
    return parseClosedSet('price kind', PRICE_KINDS, value);
}
