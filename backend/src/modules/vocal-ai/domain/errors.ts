import { ArgumentInvalidError, BaseError, ConflictError } from '../../../shared/errors';

export const VocalAiErrorCode = {
    InvalidTranscript: 'VOCAL_AI_INVALID_TRANSCRIPT',
    CursorRegression: 'VOCAL_AI_SYNC_CURSOR_REGRESSION',
    AuthenticationFailed: 'VOCAL_AI_AUTHENTICATION_FAILED',
    RequestFailed: 'VOCAL_AI_REQUEST_FAILED',
} as const;

/** `lineIndex` of the transcript lines is not a contiguous, monotonically increasing sequence from 0. */
export class InvalidCallTranscriptError extends ArgumentInvalidError {
    override readonly code: string = VocalAiErrorCode.InvalidTranscript;
}

/** `advanceTo` was called with a timestamp earlier than the already stored `lastSyncedAt`. */
export class SyncCursorRegressionError extends ConflictError {
    override readonly code: string = VocalAiErrorCode.CursorRegression;
}

/** SSO login, token exchange, or token refresh/recovery against VocalAI failed. */
export class VocalAiAuthenticationError extends BaseError {
    readonly code: string = VocalAiErrorCode.AuthenticationFailed;
}

/** A VocalAI API call failed after exhausting retries, or returned an unparsable response. */
export class VocalAiRequestError extends BaseError {
    readonly code: string = VocalAiErrorCode.RequestFailed;
}
