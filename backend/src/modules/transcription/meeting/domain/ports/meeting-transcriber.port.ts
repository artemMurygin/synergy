import type { Readable } from 'node:stream';
import type { DiarizedTranscript } from '../diarized-transcript';
import type { TranscriptionUsage } from '../transcription-usage';

/** Recording to transcribe: the content stream and its metadata. */
export interface MeetingAudio {
    readonly stream: Readable;
    readonly contentType: string;
    readonly sizeBytes: number;
}

/** Result of a whole recording and the total usage billed by the provider for it. */
export interface MeetingTranscription {
    readonly transcript: DiarizedTranscript;
    readonly usage: TranscriptionUsage;
}

/**
 * Speech recognition with speakers for a whole recording. Throws
 * `TranscriptionTemporaryError` or `TranscriptionPermanentError(reason)`.
 */
export abstract class MeetingTranscriberPort {
    abstract transcribe(audio: MeetingAudio, signal: AbortSignal): Promise<MeetingTranscription>;
}
