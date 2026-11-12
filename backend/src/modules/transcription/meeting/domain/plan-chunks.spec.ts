import { describe, expect, it } from 'vitest';
import { InvalidAudioChunkError } from './errors';
import { planChunks } from './plan-chunks';

describe('planChunks', () => {
    it('splits 25 min into 3 chunks of 600 s with 30 s overlap', () => {
        expect(planChunks(1500, 600, 30)).toEqual([
            { index: 0, startSec: 0, endSec: 600 },
            { index: 1, startSec: 570, endSec: 1170 },
            { index: 2, startSec: 1140, endSec: 1500 },
        ]);
    });

    it('gives one chunk for a recording shorter than a chunk', () => {
        expect(planChunks(85, 600, 30)).toEqual([{ index: 0, startSec: 0, endSec: 85 }]);
    });

    it('gives one chunk for a recording of exactly one chunk', () => {
        expect(planChunks(600, 600, 30)).toEqual([{ index: 0, startSec: 0, endSec: 600 }]);
    });

    it('rejects invalid parameters', () => {
        expect(() => planChunks(0, 600, 30)).toThrow(InvalidAudioChunkError);
        expect(() => planChunks(100, 30, 30)).toThrow(InvalidAudioChunkError);
        expect(() => planChunks(100, 600, -1)).toThrow(InvalidAudioChunkError);
    });
});
