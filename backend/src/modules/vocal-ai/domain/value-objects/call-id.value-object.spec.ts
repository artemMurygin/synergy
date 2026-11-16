import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { CallId } from './call-id.value-object';

describe('CallId', () => {
    it('accepts a positive integer', () => {
        const callId = new CallId(42);

        expect(callId.value).toBe(42);
    });

    it('rejects zero', () => {
        expect(() => new CallId(0)).toThrow(ArgumentInvalidError);
    });

    it('rejects negative integers', () => {
        expect(() => new CallId(-1)).toThrow(ArgumentInvalidError);
    });

    it('rejects non-integer numbers', () => {
        expect(() => new CallId(1.5)).toThrow(ArgumentInvalidError);
    });
});
