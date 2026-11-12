import { InvalidAudioChunkError } from './errors';

/** A piece of the recording on disk; time in seconds from the start of the recording. */
export interface AudioChunk {
    readonly index: number;
    readonly path: string;
    readonly startSec: number;
    readonly endSec: number;
    readonly sizeBytes: number;
}

export const AudioChunk = {
    of(input: AudioChunk, maxBytes: number): AudioChunk {
        if (!Number.isInteger(input.index) || input.index < 0) {
            throw new InvalidAudioChunkError('Chunk index must be a non-negative integer');
        }
        if (input.path.length === 0) {
            throw new InvalidAudioChunkError('Chunk path must not be empty');
        }
        if (
            !Number.isFinite(input.startSec) ||
            !Number.isFinite(input.endSec) ||
            input.startSec < 0 ||
            input.startSec >= input.endSec
        ) {
            throw new InvalidAudioChunkError('Chunk time must satisfy 0 <= startSec < endSec');
        }
        if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) {
            throw new InvalidAudioChunkError('Chunk size must be a non-negative integer');
        }
        if (input.sizeBytes > maxBytes) {
            throw new InvalidAudioChunkError('Chunk is larger than the limit', undefined, {
                index: input.index,
                sizeBytes: input.sizeBytes,
                maxBytes,
            });
        }
        return Object.freeze({ ...input });
    },
};
