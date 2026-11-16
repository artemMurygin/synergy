import type { SpeakerTalkTime } from './ports/transcript-segment-repository.port';
import type { SpeakerNames } from './speaker-names';
import { UNRECOGNIZED_SPEAKER } from './transcript-segment';

/** Собеседник готовой расшифровки для API и агента: имя (или `null`) и время речи. */
export interface SpeakerSummary {
    readonly speaker: number;
    readonly name: string | null;
    readonly talkSec: number;
    /** Доля от суммарного времени речи, 0..1, три знака после запятой. */
    readonly talkShare: number;
}

/** Все собеседники `1..speakerCount`, в том числе без реплик в статистике. */
export function summarizeSpeakers(
    speakerCount: number,
    names: SpeakerNames,
    stats: readonly SpeakerTalkTime[],
): SpeakerSummary[] {
    const talk = new Map(stats.map((s) => [s.speaker, s.talkSec]));
    const numbered = stats.filter((s) => s.speaker !== UNRECOGNIZED_SPEAKER);
    const total = numbered.reduce((sum, s) => sum + s.talkSec, 0);
    return Array.from({ length: speakerCount }, (_, i) => {
        const speaker = i + 1;
        const talkSec = talk.get(speaker) ?? 0;
        return Object.freeze({
            speaker,
            name: names.nameOf(speaker),
            talkSec,
            talkShare: total > 0 ? Math.round((talkSec / total) * 1000) / 1000 : 0,
        });
    });
}
