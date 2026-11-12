export const TRANSCRIPTION_STATUSES = [
    'pending',
    'processing',
    'completed',
    'no_speech',
    'failed',
] as const;

export type TranscriptionStatus = (typeof TRANSCRIPTION_STATUSES)[number];

/** Final statuses: the recording hold is released after reaching one of them. */
export type FinalTranscriptionStatus = Extract<
    TranscriptionStatus,
    'completed' | 'no_speech' | 'failed'
>;

export const TRANSCRIPTION_FAILURE_REASONS = [
    'provider-unavailable',
    'unsupported-media',
    'too-long',
    'timeout',
    // Владелец удалил запись до завершения расшифровки.
    'file-deleted',
] as const;

export type TranscriptionFailureReason = (typeof TRANSCRIPTION_FAILURE_REASONS)[number];

export function isTranscriptionStatus(value: string): value is TranscriptionStatus {
    return (TRANSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function isTranscriptionFailureReason(value: string): value is TranscriptionFailureReason {
    return (TRANSCRIPTION_FAILURE_REASONS as readonly string[]).includes(value);
}
