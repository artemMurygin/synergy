import type { ChunkWord } from '../domain/chunk-word';
import type { ExemplarPlacement } from '../domain/ports/audio-chunker.port';
import type { IngestChunk } from '../domain/speaker-registry';

let seq = 0;

/** Words of one speaker every `step` seconds in `[from, to]`, each 0.4 s long. */
export function run(speaker: string, from: number, to: number, step = 0.5): ChunkWord[] {
    const words: ChunkWord[] = [];
    for (let t = from; t + 0.4 <= to + 1e-9; t += step) {
        const start = Math.round(t * 100) / 100;
        words.push({
            text: `t${String(++seq)}`,
            start,
            end: Math.round((start + 0.4) * 100) / 100,
            speaker,
        });
    }
    return words;
}

export function chunk(
    index: number,
    startSec: number,
    endSec: number,
    prefixSec = 0,
    exemplarLayout: readonly ExemplarPlacement[] = [],
): IngestChunk {
    return { index, startSec, endSec, prefixSec, exemplarLayout };
}
