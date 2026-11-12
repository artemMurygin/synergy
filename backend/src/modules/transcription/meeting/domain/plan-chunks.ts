import { InvalidAudioChunkError } from './errors';
import type { ChunkPlan } from './ports/audio-chunker.port';

/**
 * Splits a recording into chunks of `chunkSec` overlapping by `overlapSec`.
 * The last chunk may be shorter; a recording shorter than a chunk gives one chunk.
 */
export function planChunks(durationSec: number, chunkSec: number, overlapSec: number): ChunkPlan[] {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new InvalidAudioChunkError('Duration must be a positive number');
    }
    if (!Number.isFinite(overlapSec) || overlapSec < 0 || !(chunkSec > overlapSec)) {
        throw new InvalidAudioChunkError('Chunk must be longer than a non-negative overlap');
    }
    const chunks: ChunkPlan[] = [];
    let startSec = 0;
    for (;;) {
        const endSec = Math.min(startSec + chunkSec, durationSec);
        chunks.push({ index: chunks.length, startSec, endSec });
        if (endSec >= durationSec) return chunks;
        startSec = endSec - overlapSec;
    }
}
