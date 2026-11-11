import { InvalidVoiceClipError } from './errors';

/** Audio formats the provider accepts in `input_audio.format`. */
export type AudioFormat = 'ogg' | 'mp3' | 'wav';

const FORMAT_BY_MIME_TYPE: Readonly<Record<string, AudioFormat>> = {
    'audio/ogg': 'ogg',
    'audio/opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
};

export interface VoiceClipInput {
    readonly audio: Buffer;
    /** `voice.mime_type` from Telegram, `audio/ogg` for voice messages. */
    readonly mimeType: string;
    /** `voice.duration` from Telegram, in seconds. */
    readonly durationSec: number;
}

function normalizeMimeType(raw: string): string {
    return (raw.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * A recorded voice message. It only checks itself: the limits of the transcription are checked by
 * the use case, so that exceeding them is a result and not an exception.
 */
export class VoiceClip {
    private constructor(
        readonly audio: Buffer,
        readonly mimeType: string,
        readonly durationSec: number,
    ) {}

    static of(input: VoiceClipInput): VoiceClip {
        if (!Number.isFinite(input.durationSec) || input.durationSec < 0) {
            throw new InvalidVoiceClipError('Voice clip duration must be a non-negative number');
        }
        if (input.audio.byteLength === 0) {
            throw new InvalidVoiceClipError('Voice clip audio must not be empty');
        }
        const mimeType = normalizeMimeType(input.mimeType);
        if (mimeType.length === 0) {
            throw new InvalidVoiceClipError('Voice clip mime type must not be empty');
        }
        return new VoiceClip(input.audio, mimeType, input.durationSec);
    }

    get sizeBytes(): number {
        return this.audio.byteLength;
    }

    /** Provider format of the clip, `null` when the clip is not a supported audio format. */
    get format(): AudioFormat | null {
        return FORMAT_BY_MIME_TYPE[this.mimeType] ?? null;
    }
}
