import { describe, expect, it } from 'vitest';
import { DiarizedTranscript } from './diarized-transcript';
import { InvalidDiarizedTranscriptError } from './errors';
import { TranscriptSegment } from './transcript-segment';

const seg = (seq: number, speaker: number, startSec: number, endSec: number): TranscriptSegment =>
    TranscriptSegment.of({ seq, speaker, startSec, endSec, text: 'слово' });

describe('DiarizedTranscript', () => {
    it('keeps language, duration and segments', () => {
        const segments = [seg(0, 1, 0, 1), seg(1, 2, 1, 2)];
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
                segments: [seg(0, 1, 5, 6), seg(1, 2, 1, 2)],
            }),
        ).toThrow(InvalidDiarizedTranscriptError);
    });

    it.each([
        ['starting not from zero', [seg(1, 1, 0, 1), seg(2, 2, 1, 2)]],
        ['with a gap', [seg(0, 1, 0, 1), seg(2, 2, 1, 2)]],
    ])('rejects sequence numbers %s', (_case, segments) => {
        expect(() => DiarizedTranscript.of({ language: 'ru', durationSec: 10, segments })).toThrow(
            InvalidDiarizedTranscriptError,
        );
    });
});
