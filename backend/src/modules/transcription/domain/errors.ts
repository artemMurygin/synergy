import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const TranscriptionErrorCode = {
    InvalidVoiceClip: 'TRANSCRIPTION_INVALID_VOICE_CLIP',
    InvalidResult: 'TRANSCRIPTION_INVALID_RESULT',
    ProviderFailed: 'TRANSCRIPTION_PROVIDER_FAILED',
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
