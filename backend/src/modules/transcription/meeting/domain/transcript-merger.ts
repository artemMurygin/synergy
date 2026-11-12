import type { ChunkWord } from './chunk-word';
import { DiarizedTranscript } from './diarized-transcript';
import type { SpeakerRegistry } from './speaker-registry';
import { TranscriptSegment } from './transcript-segment';

/**
 * Joins words of all chunks into one transcript. Adjacent chunks meet at the middle of their
 * overlap; words are grouped by speaker change; speakers are numbered 1, 2, … by first appearance.
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

        const numbers = new Map<string, number>();
        const groups: { speaker: string; words: ChunkWord[] }[] = [];
        for (const w of words) {
            const last = groups.at(-1);
            if (last?.speaker === w.speaker) {
                last.words.push(w);
                continue;
            }
            if (!numbers.has(w.speaker)) numbers.set(w.speaker, numbers.size + 1);
            groups.push({ speaker: w.speaker, words: [w] });
        }

        const segments = groups.map(({ speaker, words: group }, seq) =>
            TranscriptSegment.of({
                seq,
                speaker: numbers.get(speaker) ?? 0,
                startSec: Math.max(0, group[0].start),
                endSec: Math.max(0, ...group.map((w) => w.end)),
                text: group.map((w) => w.text.trim()).join(' '),
            }),
        );
        return DiarizedTranscript.of({ language, durationSec, segments });
    },
};
