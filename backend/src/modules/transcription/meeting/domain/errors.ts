import { ArgumentInvalidError, BaseError, ConflictError } from '../../../../shared/errors';
import type { TranscriptionFailureReason } from './transcription-status';

export const MeetingTranscriptionErrorCode = {
    InvalidSegment: 'MEETING_TRANSCRIPTION_INVALID_SEGMENT',
    InvalidTranscript: 'MEETING_TRANSCRIPTION_INVALID_TRANSCRIPT',
    InvalidChunk: 'MEETING_TRANSCRIPTION_INVALID_CHUNK',
    InvalidState: 'MEETING_TRANSCRIPTION_INVALID_STATE',
    InvalidTransition: 'MEETING_TRANSCRIPTION_INVALID_TRANSITION',
    NotRetryable: 'MEETING_TRANSCRIPTION_NOT_RETRYABLE',
    Temporary: 'MEETING_TRANSCRIPTION_TEMPORARY',
    Permanent: 'MEETING_TRANSCRIPTION_PERMANENT',
} as const;

export class InvalidTranscriptSegmentError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidSegment;
}

export class InvalidDiarizedTranscriptError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidTranscript;
}

export class InvalidAudioChunkError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidChunk;
}

/** A restored or mutated aggregate breaks its invariants. */
export class InvalidMeetingTranscriptStateError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidState;
}

/** The status does not allow the requested transition. */
export class MeetingTranscriptTransitionError extends ConflictError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidTransition;
}

/** Retry is allowed only from `failed` (HTTP 409). */
export class MeetingTranscriptNotRetryableError extends ConflictError {
    override readonly code: string = MeetingTranscriptionErrorCode.NotRetryable;
}

/** Network, 5xx, 429 or timeout: the job may be retried. No audio or text in message/metadata. */
export class TranscriptionTemporaryError extends BaseError {
    readonly code = MeetingTranscriptionErrorCode.Temporary;
}

/** The provider or the decoder rejected the recording: no retries. */
export class TranscriptionPermanentError extends BaseError {
    readonly code = MeetingTranscriptionErrorCode.Permanent;

    constructor(
        readonly reason: TranscriptionFailureReason,
        message = `Meeting transcription failed permanently: ${reason}`,
        cause?: Error,
        metadata?: unknown,
    ) {
        super(message, cause, metadata);
    }
}
