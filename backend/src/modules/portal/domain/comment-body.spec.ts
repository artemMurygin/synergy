import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { CommentBody, MAX_COMMENT_LENGTH } from './comment-body';

describe('CommentBody', () => {
    it('trims surrounding spaces and newlines', () => {
        expect(CommentBody.of(' \n Привет \n ').value).toBe('Привет');
    });

    it('keeps inner line breaks', () => {
        expect(CommentBody.of('a\n\nb').value).toBe('a\n\nb');
    });

    it('rejects empty and whitespace-only input', () => {
        expect(() => CommentBody.of('')).toThrow(ArgumentInvalidError);
        expect(() => CommentBody.of('  \n\t \n ')).toThrow(ArgumentInvalidError);
    });

    it('accepts exactly the limit and rejects one more after trimming', () => {
        expect(MAX_COMMENT_LENGTH).toBe(4000);
        expect(CommentBody.of(` ${'a'.repeat(4000)} `).value).toHaveLength(4000);
        expect(() => CommentBody.of('a'.repeat(4001))).toThrow(ArgumentInvalidError);
    });

    it('keeps markup as is', () => {
        expect(CommentBody.of('<b>x</b>').value).toBe('<b>x</b>');
    });
});
