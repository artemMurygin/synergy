/** A provider word: time in seconds from the start of its chunk, speaker label local to the chunk. */
export interface ChunkWord {
    readonly text: string;
    readonly start: number;
    readonly end: number;
    readonly speaker: string;
}
