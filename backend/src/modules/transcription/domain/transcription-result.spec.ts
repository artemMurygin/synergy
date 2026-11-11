import { describe, expect, it } from 'vitest';
import { InvalidTranscriptionResultError } from './errors';
import { TranscriptionResult } from './transcription-result';

describe('TranscriptionResult', () => {
    it('builds a text result with the trimmed transcript', () => {
        expect(TranscriptionResult.text('  привет  ')).toEqual({ kind: 'text', text: 'привет' });
    });

    it('refuses an empty transcript: that is no-speech, not text', () => {
        expect(() => TranscriptionResult.text('   ')).toThrow(InvalidTranscriptionResultError);
    });

    it('builds no-speech and rejected results', () => {
        expect(TranscriptionResult.noSpeech()).toEqual({ kind: 'no-speech' });
        expect(TranscriptionResult.rejected('too-long')).toEqual({
            kind: 'rejected',
            reason: 'too-long',
        });
    });
});
