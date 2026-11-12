import { InvalidDiarizedTranscriptError } from './errors';
import type { TranscriptSegment } from './transcript-segment';

/**
 * Merged result of all chunks: segments ordered by time from the start of the recording,
 * adjacent segments of one speaker already joined. Empty segments mean no speech.
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
        for (let i = 1; i < input.segments.length; i++) {
            if (input.segments[i].start < input.segments[i - 1].start) {
                throw new InvalidDiarizedTranscriptError('Segments must be ordered by time');
            }
        }
        const language = input.language?.trim() ?? '';
        return Object.freeze({
            language: language.length > 0 ? language : null,
            durationSec: input.durationSec,
            segments: Object.freeze([...input.segments]),
        });
    },
};
