import { describe, expect, it } from 'vitest';
import { Frequency, InvalidFrequencyError } from './frequency';

describe('Frequency', () => {
    it('accepts a positive integer with a known period', () => {
        const f = Frequency.of(5, 'week');
        expect(f.count).toBe(5);
        expect(f.period).toBe('week');
        expect(Frequency.of(1, 'day').period).toBe('day');
        expect(Frequency.of(2, 'month').period).toBe('month');
    });

    it('rejects zero, negative, fractional and non-finite counts', () => {
        for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => Frequency.of(bad, 'day')).toThrow(InvalidFrequencyError);
        }
    });

    it('rejects an unknown period', () => {
        expect(() => Frequency.of(1, 'year')).toThrow(InvalidFrequencyError);
        expect(() => Frequency.of(1, '')).toThrow(InvalidFrequencyError);
    });
});
