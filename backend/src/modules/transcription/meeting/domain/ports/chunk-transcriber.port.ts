import type { AudioChunk } from '../audio-chunk';
import type { ChunkWord } from '../chunk-word';
import type { TranscriptionUsage } from '../transcription-usage';

/** Provider answer for one chunk: words with time from the start of the chunk file. */
export interface ChunkTranscription {
    readonly language: string | null;
    readonly words: readonly ChunkWord[];
    /** Что провайдер посчитал за кусок; `null`, если ответ этого не содержит. */
    readonly usage: TranscriptionUsage | null;
}

/**
 * Speech recognition with diarization for one chunk file. Throws
 * `TranscriptionTemporaryError` or `TranscriptionPermanentError`; stops when `signal` is aborted.
 */
export abstract class ChunkTranscriberPort {
    abstract transcribe(chunk: AudioChunk, signal: AbortSignal): Promise<ChunkTranscription>;
}
