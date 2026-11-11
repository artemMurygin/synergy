import type { TranscriptionResult } from '../transcription-result';
import type { VoiceClip } from '../voice-clip';

/**
 * Speech recognition provider. It does not check the limits: the use case does that before the
 * call. Returns `text` or `no-speech`; throws when the provider fails, and stops when `signal`
 * is aborted.
 */
export abstract class TranscriberPort {
    abstract transcribe(clip: VoiceClip, signal: AbortSignal): Promise<TranscriptionResult>;
}
