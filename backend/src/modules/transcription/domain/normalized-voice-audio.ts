/** Voice audio ready for the provider, with the duration measured on the server. */
export interface NormalizedVoiceAudio {
    /** ogg/opus after re-encoding, or the original bytes for ogg, mp3 and wav. */
    readonly audio: Buffer;
    /** Provider-accepted MIME type of `audio`. */
    readonly mimeType: string;
    /** Measured by ffprobe over the audio packets, never taken from the client. */
    readonly durationSec: number;
}
