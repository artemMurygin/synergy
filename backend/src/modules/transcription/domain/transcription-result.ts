import { InvalidTranscriptionResultError } from './errors';

export type TranscriptionRejectReason =
    'too-long' | 'too-large' | 'unsupported-format' | 'provider-unavailable';

export type TranscriptionResult =
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'no-speech' }
    | { readonly kind: 'rejected'; readonly reason: TranscriptionRejectReason };

export const TranscriptionResult = {
    /** A non-empty transcript; an empty one is `noSpeech()`. */
    text: (text: string): TranscriptionResult => {
        const trimmed = text.trim();
        if (trimmed.length === 0) {
            throw new InvalidTranscriptionResultError('Transcript must not be empty');
        }
        return { kind: 'text', text: trimmed };
    },
    noSpeech: (): TranscriptionResult => ({ kind: 'no-speech' }),
    rejected: (reason: TranscriptionRejectReason): TranscriptionResult => ({
        kind: 'rejected',
        reason,
    }),
};
