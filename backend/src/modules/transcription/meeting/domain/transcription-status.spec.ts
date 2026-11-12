import { describe, expect, it } from 'vitest';
import {
    isTranscriptionFailureReason,
    isTranscriptionStatus,
    TRANSCRIPTION_FAILURE_REASONS,
    TRANSCRIPTION_STATUSES,
} from './transcription-status';

describe('transcription status and failure reason', () => {
    it('are closed sets', () => {
        expect(TRANSCRIPTION_STATUSES).toEqual([
            'pending',
            'processing',
            'completed',
            'no_speech',
            'failed',
        ]);
        expect(TRANSCRIPTION_FAILURE_REASONS).toEqual([
            'provider-unavailable',
            'unsupported-media',
            'too-long',
            'timeout',
            'file-deleted',
        ]);
    });

    it('recognize only known values', () => {
        expect(isTranscriptionStatus('no_speech')).toBe(true);
        expect(isTranscriptionStatus('done')).toBe(false);
        expect(isTranscriptionFailureReason('timeout')).toBe(true);
        expect(isTranscriptionFailureReason('file-deleted')).toBe(true);
        expect(isTranscriptionFailureReason('too-large')).toBe(false);
    });
});
