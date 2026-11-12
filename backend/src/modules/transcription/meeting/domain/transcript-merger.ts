import type { ChunkWord } from './chunk-word';
import { DiarizedTranscript } from './diarized-transcript';
import type { SpeakerRegistry } from './speaker-registry';
import { TranscriptSegment } from './transcript-segment';

/**
 * Joins words of all chunks into one transcript. Adjacent chunks meet at the middle of their
 * overlap; words are grouped by speaker change; speakers are numbered by first appearance.
 */
export const TranscriptMerger = {
    merge(
        registry: SpeakerRegistry,
        { overlapSec }: { overlapSec: number },
        language: string | null,
        durationSec: number,
    ): DiarizedTranscript {
        const chunks = registry.chunks();
        const words: ChunkWord[] = [];
        chunks.forEach((chunk, i) => {
            const from = i > 0 ? chunk.startSec + overlapSec / 2 : -Infinity;
            const next = chunks.at(i + 1);
            const to = next !== undefined ? next.startSec + overlapSec / 2 : Infinity;
            for (const w of chunk.words) {
                const mid = (w.start + w.end) / 2;
                if (mid >= from && mid < to && w.text.trim().length > 0) words.push(w);
            }
        });
        words.sort((a, b) => a.start - b.start);

        const labels = new Map<string, string>();
        const groups: { speaker: string; words: ChunkWord[] }[] = [];
        for (const w of words) {
            const last = groups.at(-1);
            if (last?.speaker === w.speaker) {
                last.words.push(w);
                continue;
            }
            if (!labels.has(w.speaker)) labels.set(w.speaker, `Спикер ${String(labels.size + 1)}`);
            groups.push({ speaker: w.speaker, words: [w] });
        }

        const segments = groups.map(({ speaker, words: group }) =>
            TranscriptSegment.of({
                speaker: labels.get(speaker) ?? speaker,
                start: Math.max(0, group[0].start),
                end: Math.max(0, ...group.map((w) => w.end)),
                text: group.map((w) => w.text.trim()).join(' '),
            }),
        );
        return DiarizedTranscript.of({ language, durationSec, segments });
    },
};
