import { describe, expect, it } from 'vitest';
import { DiarizedTranscript } from './diarized-transcript';
import { InvalidDiarizedTranscriptError } from './errors';
import { TranscriptSegment } from './transcript-segment';

const seg = (speaker: string, start: number, end: number): TranscriptSegment =>
    TranscriptSegment.of({ speaker, start, end, text: 'слово' });

describe('DiarizedTranscript', () => {
    it('keeps language, duration and segments', () => {
        const segments = [seg('Спикер 1', 0, 1), seg('Спикер 2', 1, 2)];
        const transcript = DiarizedTranscript.of({ language: 'ru', durationSec: 2, segments });

        expect(transcript.language).toBe('ru');
        expect(transcript.durationSec).toBe(2);
        expect(transcript.segments).toEqual(segments);
    });

    it('allows an unknown language and no segments', () => {
        const transcript = DiarizedTranscript.of({ language: null, durationSec: 5, segments: [] });

        expect(transcript.language).toBeNull();
        expect(transcript.segments).toEqual([]);
    });

    it.each([-1, Number.NaN])('rejects the duration %s', (durationSec) => {
        expect(() => DiarizedTranscript.of({ language: 'ru', durationSec, segments: [] })).toThrow(
            InvalidDiarizedTranscriptError,
        );
    });

    it('rejects segments out of time order', () => {
        expect(() =>
            DiarizedTranscript.of({
                language: 'ru',
                durationSec: 10,
                segments: [seg('Спикер 1', 5, 6), seg('Спикер 2', 1, 2)],
            }),
        ).toThrow(InvalidDiarizedTranscriptError);
    });
});
