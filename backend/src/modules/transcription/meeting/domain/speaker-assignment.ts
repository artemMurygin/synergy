import { UnknownSpeakerError } from './errors';
import { SpeakerName } from './speaker-name';

/** Сырой пункт назначения из запроса: `null` или пустая строка сбрасывает имя. */
export interface SpeakerAssignmentInput {
    readonly speaker: number;
    readonly name: string | null;
}

/** Проверенный пункт назначения: `name === null` — сброс к метке «Спикер N». */
export interface SpeakerAssignment {
    readonly speaker: number;
    readonly name: SpeakerName | null;
}

export const SpeakerAssignment = {
    of(input: SpeakerAssignmentInput): SpeakerAssignment {
        if (!isSpeakerNumber(input.speaker)) throw new UnknownSpeakerError([input.speaker]);
        const raw = input.name?.trim() ?? '';
        return Object.freeze({
            speaker: input.speaker,
            name: raw.length === 0 ? null : SpeakerName.of(raw),
        });
    },
};

export function isSpeakerNumber(speaker: number): boolean {
    return Number.isInteger(speaker) && speaker >= 1;
}
