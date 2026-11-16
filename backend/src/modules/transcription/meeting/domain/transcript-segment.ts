import { InvalidTranscriptSegmentError } from './errors';

/** Реплика, для которой провайдер не вернул метку собеседника («Нераспознан»). */
export const UNRECOGNIZED_SPEAKER = 0;

/**
 * A phrase of one speaker; time in seconds from the start of the whole recording.
 * `seq` — порядковый номер в расшифровке с нуля, `speaker` — номер собеседника с единицы
 * или `UNRECOGNIZED_SPEAKER` (метка «Спикер N» и имя — только отображение). После `complete` сегмент неизменен.
 */
export interface TranscriptSegment {
    readonly seq: number;
    readonly speaker: number;
    readonly startSec: number;
    readonly endSec: number;
    readonly text: string;
}

export const TranscriptSegment = {
    of(input: TranscriptSegment): TranscriptSegment {
        const { seq, speaker, startSec, endSec } = input;
        if (!Number.isInteger(seq) || seq < 0) {
            throw new InvalidTranscriptSegmentError('Segment seq must be a non-negative integer');
        }
        if (!Number.isInteger(speaker) || speaker < UNRECOGNIZED_SPEAKER) {
            throw new InvalidTranscriptSegmentError('Segment speaker must be an integer >= 0');
        }
        if (
            !Number.isFinite(startSec) ||
            !Number.isFinite(endSec) ||
            startSec < 0 ||
            endSec < startSec
        ) {
            throw new InvalidTranscriptSegmentError('Segment time must satisfy 0 <= start <= end');
        }
        const text = input.text.trim();
        if (text.length === 0) {
            throw new InvalidTranscriptSegmentError('Segment text must not be empty');
        }
        return Object.freeze({ seq, speaker, startSec, endSec, text });
    },
};

export function countSpeakers(segments: readonly TranscriptSegment[]): number {
    const numbered = segments.filter((s) => s.speaker !== UNRECOGNIZED_SPEAKER);
    return new Set(numbered.map((s) => s.speaker)).size;
}
