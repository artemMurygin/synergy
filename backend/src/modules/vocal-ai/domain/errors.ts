import { ArgumentInvalidError, ConflictError } from '../../../shared/errors';

export const VocalAiErrorCode = {
    InvalidTranscript: 'VOCAL_AI_INVALID_TRANSCRIPT',
    CursorRegression: 'VOCAL_AI_SYNC_CURSOR_REGRESSION',
} as const;

/** `lineIndex` of the transcript lines is not a contiguous, monotonically increasing sequence from 0. */
export class InvalidCallTranscriptError extends ArgumentInvalidError {
    override readonly code: string = VocalAiErrorCode.InvalidTranscript;
}

/** `advanceTo` was called with a timestamp earlier than the already stored `lastSyncedAt`. */
export class SyncCursorRegressionError extends ConflictError {
    override readonly code: string = VocalAiErrorCode.CursorRegression;
}
