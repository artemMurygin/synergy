import { InvalidTranscriptSegmentError } from './errors';

/** A phrase of one speaker; time in seconds from the start of the whole recording. */
export interface TranscriptSegment {
    readonly speaker: string;
    readonly start: number;
    readonly end: number;
    readonly text: string;
}

export const TranscriptSegment = {
    of(input: TranscriptSegment): TranscriptSegment {
        const { start, end } = input;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
            throw new InvalidTranscriptSegmentError('Segment time must satisfy 0 <= start <= end');
        }
        const speaker = input.speaker.trim();
        if (speaker.length === 0) {
            throw new InvalidTranscriptSegmentError('Segment speaker must not be empty');
        }
        const text = input.text.trim();
        if (text.length === 0) {
            throw new InvalidTranscriptSegmentError('Segment text must not be empty');
        }
        return Object.freeze({ speaker, start, end, text });
    },
};

export function countSpeakers(segments: readonly TranscriptSegment[]): number {
    return new Set(segments.map((s) => s.speaker)).size;
}
