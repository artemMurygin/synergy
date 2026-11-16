import { InvalidSpeakerNameError } from './errors';
import { isSpeakerNumber, type SpeakerAssignment } from './speaker-assignment';
import { SpeakerName } from './speaker-name';
import { UNRECOGNIZED_SPEAKER } from './transcript-segment';

export interface SpeakerNameEntry {
    readonly speaker: number;
    readonly name: string;
}

/** Метка собеседника без имени. */
export function defaultSpeakerLabel(speaker: number): string {
    if (speaker === UNRECOGNIZED_SPEAKER) return 'Нераспознан';
    return `Спикер ${String(speaker)}`;
}

/**
 * Неизменяемая карта «номер собеседника → имя». Есть только у собеседников с именем;
 * одно имя может стоять у нескольких собеседников. `assign` возвращает новую карту.
 */
export class SpeakerNames {
    private constructor(private readonly names: ReadonlyMap<number, SpeakerName>) {
        Object.freeze(this);
    }

    static empty(): SpeakerNames {
        return new SpeakerNames(new Map());
    }

    /** Восстановление из хранилища: имена проверяются заново. */
    static of(entries: Iterable<readonly [number, string]>): SpeakerNames {
        const names = new Map<number, SpeakerName>();
        for (const [speaker, name] of entries) {
            if (!isSpeakerNumber(speaker)) {
                throw new InvalidSpeakerNameError('Speaker number must be an integer >= 1');
            }
            names.set(speaker, SpeakerName.of(name));
        }
        return new SpeakerNames(names);
    }

    assign(assignments: readonly SpeakerAssignment[]): SpeakerNames {
        const next = new Map(this.names);
        for (const { speaker, name } of assignments) {
            if (name === null) next.delete(speaker);
            else next.set(speaker, name);
        }
        return new SpeakerNames(next);
    }

    nameOf(speaker: number): string | null {
        return this.names.get(speaker)?.value ?? null;
    }

    labelOf(speaker: number): string {
        return this.nameOf(speaker) ?? defaultSpeakerLabel(speaker);
    }

    /** По возрастанию номера собеседника. */
    entries(): SpeakerNameEntry[] {
        return [...this.names.entries()]
            .sort(([a], [b]) => a - b)
            .map(([speaker, name]) => ({ speaker, name: name.value }));
    }

    maxSpeaker(): number {
        return Math.max(0, ...this.names.keys());
    }
}
