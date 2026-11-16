import { describe, expect, it } from 'vitest';
import { InvalidTranscriptSegmentError } from './errors';
import { countSpeakers, TranscriptSegment, UNRECOGNIZED_SPEAKER } from './transcript-segment';

const valid = { seq: 0, speaker: 1, startSec: 1.5, endSec: 3, text: 'привет' };

describe('TranscriptSegment', () => {
    it('keeps the number, the speaker number, the time and the trimmed text', () => {
        expect(TranscriptSegment.of({ ...valid, seq: 4, speaker: 2, text: '  привет ' })).toEqual({
            seq: 4,
            speaker: 2,
            startSec: 1.5,
            endSec: 3,
            text: 'привет',
        });
    });

    it('is immutable', () => {
        expect(Object.isFrozen(TranscriptSegment.of(valid))).toBe(true);
    });

    it('accepts a zero-length segment', () => {
        expect(TranscriptSegment.of({ ...valid, startSec: 2, endSec: 2 }).endSec).toBe(2);
    });

    it.each([
        ['negative start', -1, 2],
        ['end before start', 3, 2],
        ['NaN start', Number.NaN, 2],
        ['infinite end', 0, Number.POSITIVE_INFINITY],
    ])('rejects %s', (_case, startSec, endSec) => {
        expect(() => TranscriptSegment.of({ ...valid, startSec, endSec })).toThrow(
            InvalidTranscriptSegmentError,
        );
    });

    it('rejects an empty text', () => {
        expect(() => TranscriptSegment.of({ ...valid, text: '   ' })).toThrow(
            InvalidTranscriptSegmentError,
        );
    });

    it.each([-1, 1.5, Number.NaN])('rejects the sequence number %s', (seq) => {
        expect(() => TranscriptSegment.of({ ...valid, seq })).toThrow(
            InvalidTranscriptSegmentError,
        );
    });

    it('accepts the unrecognized speaker 0', () => {
        expect(TranscriptSegment.of({ ...valid, speaker: UNRECOGNIZED_SPEAKER }).speaker).toBe(0);
    });

    it.each([-2, 1.5, Number.NaN])('rejects the speaker number %s', (speaker) => {
        expect(() => TranscriptSegment.of({ ...valid, speaker })).toThrow(
            InvalidTranscriptSegmentError,
        );
    });
});

describe('countSpeakers', () => {
    it('counts distinct speaker numbers', () => {
        const segments = [
            TranscriptSegment.of({ ...valid, seq: 0, speaker: 1 }),
            TranscriptSegment.of({ ...valid, seq: 1, speaker: 2 }),
            TranscriptSegment.of({ ...valid, seq: 2, speaker: 1 }),
        ];

        expect(countSpeakers(segments)).toBe(2);
        expect(countSpeakers([])).toBe(0);
    });

    it('does not count unrecognized speech as a speaker', () => {
        const segments = [
            TranscriptSegment.of({ ...valid, seq: 0, speaker: 1 }),
            TranscriptSegment.of({ ...valid, seq: 1, speaker: UNRECOGNIZED_SPEAKER }),
        ];

        expect(countSpeakers(segments)).toBe(1);
        expect(countSpeakers([segments[1] ?? segments[0]])).toBe(0);
    });
});
