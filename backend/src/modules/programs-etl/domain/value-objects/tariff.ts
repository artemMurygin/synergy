import { parseClosedSet } from './closed-set';

export const TARIFFS = ['base', 'optima', 'premium'] as const;

export type Tariff = (typeof TARIFFS)[number];

export function parseTariff(value: string): Tariff {
    return parseClosedSet('tariff', TARIFFS, value);
}
