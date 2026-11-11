import { describe, expect, it } from 'vitest';
import { InvalidVoiceClipError } from './errors';
import { VoiceClip } from './voice-clip';

const AUDIO = Buffer.from('OggS-fake-opus-payload');

describe('VoiceClip', () => {
    it('keeps the audio, the duration and derives the size from the audio', () => {
        const clip = VoiceClip.of({ audio: AUDIO, mimeType: 'audio/ogg', durationSec: 20 });

        expect(clip.audio).toBe(AUDIO);
        expect(clip.durationSec).toBe(20);
        expect(clip.sizeBytes).toBe(AUDIO.byteLength);
        expect(clip.mimeType).toBe('audio/ogg');
    });

    it('normalizes the mime type: lower case, without parameters', () => {
        const clip = VoiceClip.of({
            audio: AUDIO,
            mimeType: ' Audio/OGG; codecs=opus ',
            durationSec: 3,
        });

        expect(clip.mimeType).toBe('audio/ogg');
    });

    it('accepts a zero duration', () => {
        expect(
            VoiceClip.of({ audio: AUDIO, mimeType: 'audio/ogg', durationSec: 0 }).durationSec,
        ).toBe(0);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects the duration %s',
        (durationSec) => {
            expect(() =>
                VoiceClip.of({ audio: AUDIO, mimeType: 'audio/ogg', durationSec }),
            ).toThrow(InvalidVoiceClipError);
        },
    );

    it('rejects empty audio', () => {
        expect(() =>
            VoiceClip.of({ audio: Buffer.alloc(0), mimeType: 'audio/ogg', durationSec: 1 }),
        ).toThrow(InvalidVoiceClipError);
    });

    it('rejects an empty mime type', () => {
        expect(() => VoiceClip.of({ audio: AUDIO, mimeType: '  ', durationSec: 1 })).toThrow(
            InvalidVoiceClipError,
        );
    });

    it.each([
        ['audio/ogg', 'ogg'],
        ['audio/opus', 'ogg'],
        ['audio/mpeg', 'mp3'],
        ['audio/mp3', 'mp3'],
        ['audio/wav', 'wav'],
        ['audio/x-wav', 'wav'],
    ])('maps %s to the provider format %s', (mimeType, format) => {
        expect(VoiceClip.of({ audio: AUDIO, mimeType, durationSec: 1 }).format).toBe(format);
    });

    it.each(['image/jpeg', 'video/mp4', 'application/pdf'])(
        'has no provider format for %s',
        (mimeType) => {
            expect(VoiceClip.of({ audio: AUDIO, mimeType, durationSec: 1 }).format).toBeNull();
        },
    );
});
