import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { GuideBody, MAX_GUIDE_LENGTH } from './guide-body';

describe('GuideBody', () => {
    it('trims surrounding spaces and newlines', () => {
        expect(GuideBody.of(' \n Текст \n ')?.value).toBe('Текст');
    });

    it('returns null for empty and whitespace-only input', () => {
        expect(GuideBody.of('')).toBeNull();
        expect(GuideBody.of('  \n\t \n ')).toBeNull();
    });

    it('accepts exactly the limit after trim and rejects one more', () => {
        expect(MAX_GUIDE_LENGTH).toBe(50000);
        expect(GuideBody.of(` ${'a'.repeat(50000)} `)?.value).toHaveLength(50000);
        expect(() => GuideBody.of('a'.repeat(50001))).toThrow(ArgumentInvalidError);
    });

    it('keeps HTML and inner blank lines as is', () => {
        expect(GuideBody.of('<b>x</b>\n\n\n# y')?.value).toBe('<b>x</b>\n\n\n# y');
    });
});
