import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const TranscriptionErrorCode = {
    InvalidVoiceClip: 'TRANSCRIPTION_INVALID_VOICE_CLIP',
    InvalidResult: 'TRANSCRIPTION_INVALID_RESULT',
    ProviderFailed: 'TRANSCRIPTION_PROVIDER_FAILED',
    UnsupportedVoiceAudio: 'TRANSCRIPTION_UNSUPPORTED_VOICE_AUDIO',
    VoiceAudioUnavailable: 'TRANSCRIPTION_VOICE_AUDIO_UNAVAILABLE',
} as const;

export class InvalidVoiceClipError extends ArgumentInvalidError {
    override readonly code: string = TranscriptionErrorCode.InvalidVoiceClip;
}

export class InvalidTranscriptionResultError extends ArgumentInvalidError {
    override readonly code: string = TranscriptionErrorCode.InvalidResult;
}

/**
 * The provider failed to answer. The message and metadata carry only the HTTP status and the
 * provider error code, never the audio or the transcript.
 */
export class TranscriptionProviderError extends BaseError {
    readonly code = TranscriptionErrorCode.ProviderFailed;
}

/** The upload is not readable audio. The message never holds the file name or content. */
export class UnsupportedVoiceAudioError extends BaseError {
    readonly code = TranscriptionErrorCode.UnsupportedVoiceAudio;
}

/** ffmpeg or ffprobe is missing or did not finish in time: the problem is on the server side. */
export class VoiceAudioUnavailableError extends BaseError {
    readonly code = TranscriptionErrorCode.VoiceAudioUnavailable;
}
