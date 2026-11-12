import { describe, expect, it } from 'vitest';
import { InvalidTranscriptSegmentError } from './errors';
import { countSpeakers, TranscriptSegment } from './transcript-segment';

describe('TranscriptSegment', () => {
    it('keeps the speaker, the time and the trimmed text', () => {
        expect(
            TranscriptSegment.of({ speaker: 'Спикер 1', start: 1.5, end: 3, text: '  привет ' }),
        ).toEqual({ speaker: 'Спикер 1', start: 1.5, end: 3, text: 'привет' });
    });

    it('accepts a zero-length segment', () => {
        expect(TranscriptSegment.of({ speaker: 'Спикер 1', start: 2, end: 2, text: 'а' }).end).toBe(
            2,
        );
    });

    it.each([
        ['negative start', -1, 2],
        ['end before start', 3, 2],
        ['NaN start', Number.NaN, 2],
        ['infinite end', 0, Number.POSITIVE_INFINITY],
    ])('rejects %s', (_case, start, end) => {
        expect(() =>
            TranscriptSegment.of({ speaker: 'Спикер 1', start, end, text: 'текст' }),
        ).toThrow(InvalidTranscriptSegmentError);
    });

    it('rejects an empty text', () => {
        expect(() =>
            TranscriptSegment.of({ speaker: 'Спикер 1', start: 0, end: 1, text: '   ' }),
        ).toThrow(InvalidTranscriptSegmentError);
    });

    it('rejects an empty speaker', () => {
        expect(() => TranscriptSegment.of({ speaker: ' ', start: 0, end: 1, text: 'да' })).toThrow(
            InvalidTranscriptSegmentError,
        );
    });
});

describe('countSpeakers', () => {
    it('counts distinct speaker labels', () => {
        const segments = [
            TranscriptSegment.of({ speaker: 'Спикер 1', start: 0, end: 1, text: 'а' }),
            TranscriptSegment.of({ speaker: 'Спикер 2', start: 1, end: 2, text: 'б' }),
            TranscriptSegment.of({ speaker: 'Спикер 1', start: 2, end: 3, text: 'в' }),
        ];

        expect(countSpeakers(segments)).toBe(2);
        expect(countSpeakers([])).toBe(0);
    });
});
