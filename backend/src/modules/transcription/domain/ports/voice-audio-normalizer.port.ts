import type { NormalizedVoiceAudio } from '../normalized-voice-audio';

/**
 * Brings an uploaded recording to a format the provider accepts and measures its duration.
 * Throws `UnsupportedVoiceAudioError` for a file that is not audio, `VoiceAudioUnavailableError`
 * when the tooling is missing or too slow, and stops when `signal` is aborted.
 */
export abstract class VoiceAudioNormalizerPort {
    abstract normalize(
        audio: Buffer,
        mimeType: string,
        signal: AbortSignal,
    ): Promise<NormalizedVoiceAudio>;
}
