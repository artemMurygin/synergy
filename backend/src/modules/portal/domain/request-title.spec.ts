import { describe, expect, it } from 'vitest';
import { InvalidRequestTitleError, MAX_REQUEST_TITLE_LENGTH, RequestTitle } from './request-title';

describe('RequestTitle', () => {
    it('trims surrounding whitespace', () => {
        expect(RequestTitle.of('  Сверка актов ').value).toBe('Сверка актов');
    });

    it('rejects empty or blank', () => {
        expect(() => RequestTitle.of('')).toThrow(InvalidRequestTitleError);
        expect(() => RequestTitle.of('   ')).toThrow(InvalidRequestTitleError);
    });

    it('enforces the length limit after trimming', () => {
        expect(RequestTitle.of(` ${'a'.repeat(MAX_REQUEST_TITLE_LENGTH)} `).value).toHaveLength(
            MAX_REQUEST_TITLE_LENGTH,
        );
        expect(() => RequestTitle.of('a'.repeat(MAX_REQUEST_TITLE_LENGTH + 1))).toThrow(
            InvalidRequestTitleError,
        );
    });
});
