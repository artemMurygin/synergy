import type { AudioChunk } from '../audio-chunk';

/** Planned piece of the recording: seconds from the start of the recording, `[startSec, endSec)`. */
export interface ChunkPlan {
    readonly index: number;
    readonly startSec: number;
    readonly endSec: number;
}

/** A clean stretch of a known speaker in the source recording (absolute seconds). */
export interface SpeakerExemplar {
    readonly globalSpeakerId: string;
    readonly startSec: number;
    readonly endSec: number;
}

/** Where an exemplar lies inside the rendered file. */
export interface ExemplarPlacement {
    readonly globalSpeakerId: string;
    readonly startInFileSec: number;
    readonly endInFileSec: number;
}

/** The rendered file: `[exemplar][1 s silence]…[chunk]`; the chunk starts at `prefixSec`. */
export interface RenderedAudioChunk extends AudioChunk {
    readonly prefixSec: number;
    readonly exemplarLayout: readonly ExemplarPlacement[];
}

/** Silence after each exemplar in the rendered file. */
export const EXEMPLAR_GAP_SEC = 1;

/**
 * Probes and cuts a recording on disk. Throws `TranscriptionPermanentError` with `too-long`,
 * `unsupported-media` or `provider-unavailable`; rejects with `AbortError` when `signal` aborts.
 */
export abstract class AudioChunkerPort {
    abstract probe(inputPath: string, signal: AbortSignal): Promise<{ durationSec: number }>;

    abstract render(
        inputPath: string,
        chunk: ChunkPlan,
        exemplars: readonly SpeakerExemplar[],
        workDir: string,
        signal: AbortSignal,
    ): Promise<RenderedAudioChunk>;
}
