import { ArgumentInvalidError } from '../../../shared/errors';

export const FREQUENCY_PERIODS = ['day', 'week', 'month'] as const;

export type FrequencyPeriod = (typeof FREQUENCY_PERIODS)[number];

export class InvalidFrequencyError extends ArgumentInvalidError {}

/** Частота: целое число раз больше нуля за период day|week|month. */
export class Frequency {
    private constructor(
        readonly count: number,
        readonly period: FrequencyPeriod,
    ) {}

    static of(count: number, period: string): Frequency {
        if (!Number.isInteger(count) || count <= 0) {
            throw new InvalidFrequencyError('Frequency count must be a positive integer');
        }
        const known = FREQUENCY_PERIODS.find((candidate) => candidate === period);
        if (known === undefined) {
            throw new InvalidFrequencyError(`Unknown frequency period: ${period}`);
        }
        return new Frequency(count, known);
    }
}
