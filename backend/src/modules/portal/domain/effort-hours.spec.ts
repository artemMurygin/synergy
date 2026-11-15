import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { EffortHours, MAX_EFFORT_HOURS } from './effort-hours';

describe('EffortHours', () => {
    it.each([1, 16, MAX_EFFORT_HOURS])('accepts %s', (n) => {
        expect(EffortHours.of(n).value).toBe(n);
    });

    it('MAX_EFFORT_HOURS is 2000', () => {
        expect(MAX_EFFORT_HOURS).toBe(2000);
    });

    it.each([0, -1, 1.5, 2001, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (n) => {
        expect(() => EffortHours.of(n)).toThrow(ArgumentInvalidError);
    });
});
