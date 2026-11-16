import { ArgumentInvalidError, BaseError, ConflictError } from '../../../../shared/errors';
import type { TranscriptionFailureReason } from './transcription-status';

export const MeetingTranscriptionErrorCode = {
    InvalidSegment: 'MEETING_TRANSCRIPTION_INVALID_SEGMENT',
    InvalidTranscript: 'MEETING_TRANSCRIPTION_INVALID_TRANSCRIPT',
    InvalidState: 'MEETING_TRANSCRIPTION_INVALID_STATE',
    InvalidTransition: 'MEETING_TRANSCRIPTION_INVALID_TRANSITION',
    NotRetryable: 'MEETING_TRANSCRIPTION_NOT_RETRYABLE',
    NotReady: 'MEETING_TRANSCRIPT_NOT_READY',
    UnknownSpeaker: 'MEETING_TRANSCRIPT_UNKNOWN_SPEAKER',
    InvalidSpeakerName: 'MEETING_TRANSCRIPT_INVALID_SPEAKER_NAME',
    Temporary: 'MEETING_TRANSCRIPTION_TEMPORARY',
    Permanent: 'MEETING_TRANSCRIPTION_PERMANENT',
} as const;

export class InvalidTranscriptSegmentError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidSegment;
}

export class InvalidDiarizedTranscriptError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidTranscript;
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

/** Имена собеседников меняются только у готовой расшифровки (`completed`, HTTP 409). */
export class TranscriptNotReadyError extends ConflictError {
    override readonly code: string = MeetingTranscriptionErrorCode.NotReady;
}

/** Номер собеседника вне `1..speakerCount` (HTTP 422); `speakers` — все такие номера. */
export class UnknownSpeakerError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.UnknownSpeaker;

    /** Попадает в ответ API (`violations`). */
    readonly violations: string[];

    constructor(readonly speakers: readonly number[]) {
        super(`Unknown speakers: ${speakers.join(', ')}`, undefined, { speakers });
        this.violations = speakers.map((n) => `Speaker ${String(n)} is not in the transcript`);
    }
}

/** Имя собеседника пустое или длиннее 100 символов (HTTP 422). Само имя в ошибку не попадает. */
export class InvalidSpeakerNameError extends ArgumentInvalidError {
    override readonly code: string = MeetingTranscriptionErrorCode.InvalidSpeakerName;
}

/** Network, 5xx, 429 or timeout: the job may be retried. No audio or text in message/metadata. */
export class TranscriptionTemporaryError extends BaseError {
    readonly code = MeetingTranscriptionErrorCode.Temporary;
}

/** Провайдер не ответил за отведённое время: повторяется как временная, итоговая причина — `timeout`. */
export class TranscriptionTimeoutError extends TranscriptionTemporaryError {}

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
