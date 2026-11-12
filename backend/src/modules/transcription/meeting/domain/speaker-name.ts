import { InvalidSpeakerNameError } from './errors';

export const SPEAKER_NAME_MAX_LENGTH = 100;

/** Имя собеседника: 1–100 символов после обрезки пробелов. */
export class SpeakerName {
    private constructor(readonly value: string) {
        Object.freeze(this);
    }

    static of(raw: string): SpeakerName {
        const value = raw.trim();
        if (value.length === 0 || value.length > SPEAKER_NAME_MAX_LENGTH) {
            throw new InvalidSpeakerNameError(
                `Speaker name must be 1..${String(SPEAKER_NAME_MAX_LENGTH)} characters`,
            );
        }
        return new SpeakerName(value);
    }
}
