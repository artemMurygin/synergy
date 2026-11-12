import { describe, expect, it } from 'vitest';
import { AudioChunk } from './audio-chunk';
import { InvalidAudioChunkError } from './errors';

const MAX = 20 * 1024 * 1024;
const input = { index: 0, path: '/tmp/x/out_0.ogg', startSec: 0, endSec: 600, sizeBytes: 1000 };

describe('AudioChunk', () => {
    it('keeps its fields', () => {
        expect(AudioChunk.of(input, MAX)).toEqual(input);
    });

    it('rejects startSec >= endSec', () => {
        expect(() => AudioChunk.of({ ...input, startSec: 600 }, MAX)).toThrow(
            InvalidAudioChunkError,
        );
    });

    it('rejects a negative start or index', () => {
        expect(() => AudioChunk.of({ ...input, startSec: -1 }, MAX)).toThrow(
            InvalidAudioChunkError,
        );
        expect(() => AudioChunk.of({ ...input, index: -1 }, MAX)).toThrow(InvalidAudioChunkError);
    });

    it('rejects a chunk above the size limit', () => {
        expect(() => AudioChunk.of({ ...input, sizeBytes: MAX + 1 }, MAX)).toThrow(
            InvalidAudioChunkError,
        );
        expect(AudioChunk.of({ ...input, sizeBytes: MAX }, MAX).sizeBytes).toBe(MAX);
    });
});
