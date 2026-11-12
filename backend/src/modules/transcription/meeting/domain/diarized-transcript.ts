import { InvalidDiarizedTranscriptError } from './errors';
import type { TranscriptSegment } from './transcript-segment';

/**
 * Merged result of all chunks: segments ordered by time from the start of the recording,
 * adjacent segments of one speaker already joined, `seq` from zero without gaps.
 * Empty segments mean no speech.
 */
export interface DiarizedTranscript {
    readonly language: string | null;
    readonly durationSec: number;
    readonly segments: readonly TranscriptSegment[];
}

export const DiarizedTranscript = {
    of(input: DiarizedTranscript): DiarizedTranscript {
        if (!Number.isFinite(input.durationSec) || input.durationSec < 0) {
            throw new InvalidDiarizedTranscriptError('Duration must be a non-negative number');
        }
        input.segments.forEach((segment, i) => {
            if (segment.seq !== i) {
                throw new InvalidDiarizedTranscriptError(
                    'Segment seq must go 0, 1, 2… without gaps',
                );
            }
            const previous = input.segments[i - 1] as TranscriptSegment | undefined;
            if (previous !== undefined && segment.startSec < previous.startSec) {
                throw new InvalidDiarizedTranscriptError('Segments must be ordered by time');
            }
        });
        const language = input.language?.trim() ?? '';
        return Object.freeze({
            language: language.length > 0 ? language : null,
            durationSec: input.durationSec,
            segments: Object.freeze([...input.segments]),
        });
    },
};
