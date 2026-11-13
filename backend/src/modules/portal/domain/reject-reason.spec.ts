import { describe, expect, it } from 'vitest';
import { MAX_REJECT_REASON_LENGTH, RejectReason } from './reject-reason';
import { InvalidRejectReasonError } from './errors';

describe('RejectReason', () => {
    it('trims surrounding whitespace', () => {
        expect(RejectReason.of('  Уже есть в поставке ').value).toBe('Уже есть в поставке');
    });

    it('rejects empty or blank', () => {
        expect(() => RejectReason.of('')).toThrow(InvalidRejectReasonError);
        expect(() => RejectReason.of(' \n ')).toThrow(InvalidRejectReasonError);
    });

    it('enforces the length limit after trimming', () => {
        expect(RejectReason.of(` ${'a'.repeat(MAX_REJECT_REASON_LENGTH)} `).value).toHaveLength(
            MAX_REJECT_REASON_LENGTH,
        );
        expect(() => RejectReason.of('a'.repeat(MAX_REJECT_REASON_LENGTH + 1))).toThrow(
            InvalidRejectReasonError,
        );
    });
});
