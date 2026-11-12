import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../errors';
import { AttachmentRef } from './attachment-ref';

const props = {
    fileId: 'f-1',
    name: 'встреча.m4a',
    mediaType: 'audio/mp4',
    kind: 'recording' as const,
    sizeBytes: 84 * 1024 * 1024,
};

describe('AttachmentRef', () => {
    it('keeps the file facts and is immutable', () => {
        const ref = AttachmentRef.of(props);
        expect(ref).toMatchObject(props);
        expect(Object.isFrozen(ref)).toBe(true);
    });

    it.each([
        ['an empty file id', { fileId: ' ' }],
        ['an empty name', { name: '' }],
        ['an empty media type', { mediaType: '' }],
        ['an unknown kind', { kind: 'image' }],
        ['a negative size', { sizeBytes: -1 }],
        ['a fractional size', { sizeBytes: 1.5 }],
    ])('rejects %s', (_name, override) => {
        expect(() => AttachmentRef.of({ ...props, ...override } as never)).toThrow(
            ArgumentInvalidError,
        );
    });
});
