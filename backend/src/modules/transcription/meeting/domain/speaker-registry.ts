import type { ChunkWord } from './chunk-word';
import type { RenderedAudioChunk, SpeakerExemplar } from './ports/audio-chunker.port';

/** Shortest continuous run of one speaker that may serve as a voice exemplar. */
export const MIN_EXEMPLAR_SEC = 4;
/** A pause of this length or longer breaks a run. */
export const MAX_WORD_GAP_SEC = 1;
/** Share of exemplar words a local label needs to take the exemplar's speaker. */
export const EXEMPLAR_MATCH_SHARE = 0.6;
/** Minimum words for a match, both by exemplar and by overlap. */
export const MIN_SPEAKER_MATCH_WORDS = 3;
/** Start-time tolerance when aligning overlap words with the previous chunk. */
export const OVERLAP_START_TOLERANCE_SEC = 0.5;

export interface SpeakerRegistryOptions {
    readonly maxExemplars: number;
    readonly exemplarSec: number;
}

/** What `ingest` needs from a rendered chunk. */
export type IngestChunk = Pick<
    RenderedAudioChunk,
    'index' | 'startSec' | 'endSec' | 'prefixSec' | 'exemplarLayout'
>;

/** Words of an ingested chunk: absolute time, global speaker id. */
export interface RegisteredChunk {
    readonly index: number;
    readonly startSec: number;
    readonly endSec: number;
    readonly words: readonly ChunkWord[];
}

/**
 * Global speakers of one recording. Maps chunk-local labels to global speakers by voice
 * exemplars, then by the overlap with the previous chunk, otherwise creates a new speaker.
 * Speakers whose exemplars got one local label are merged (union-find, the earlier one wins).
 */
export class SpeakerRegistry {
    private readonly parent = new Map<string, string>();
    private readonly stored: RegisteredChunk[] = [];
    private nextId = 1;

    constructor(private readonly options: SpeakerRegistryOptions) {}

    /** Up to `maxExemplars` exemplars, one per speaker, the most talkative first. */
    exemplars(): SpeakerExemplar[] {
        const stats = new Map<string, { words: number; best: Run | null }>();
        for (const c of this.chunks()) {
            for (const w of c.words) {
                const s = stats.get(w.speaker) ?? { words: 0, best: null };
                s.words++;
                stats.set(w.speaker, s);
            }
            for (const r of runs(c.words)) {
                const s = stats.get(r.speaker);
                const length = r.endSec - r.startSec;
                if (!s || length < MIN_EXEMPLAR_SEC) continue;
                if (!s.best || length > s.best.endSec - s.best.startSec) s.best = r;
            }
        }
        return [...stats.entries()]
            .filter(
                (entry): entry is [string, { words: number; best: Run }] => entry[1].best !== null,
            )
            .sort(([a, x], [b, y]) => y.words - x.words || this.order(a) - this.order(b))
            .slice(0, this.options.maxExemplars)
            .map(([, s]) => this.trim(s.best));
    }

    /** Maps local labels of the chunk, drops prefix words and stores the rest in absolute time. */
    ingest(chunk: IngestChunk, words: readonly ChunkWord[]): void {
        const sorted = [...words].sort((a, b) => a.start - b.start);
        const assigned = new Map<string, string>();

        // 1. exemplars in the prefix
        for (const placement of chunk.exemplarLayout) {
            if (!this.parent.has(placement.globalSpeakerId)) continue;
            const inside = sorted.filter((w) => {
                const mid = (w.start + w.end) / 2;
                return mid >= placement.startInFileSec && mid < placement.endInFileSec;
            });
            const top = mostFrequent(inside.map((w) => w.speaker));
            if (
                !top ||
                top.count < MIN_SPEAKER_MATCH_WORDS ||
                top.count < EXEMPLAR_MATCH_SHARE * inside.length
            ) {
                continue;
            }
            const global = this.find(placement.globalSpeakerId);
            const existing = assigned.get(top.value);
            assigned.set(top.value, existing === undefined ? global : this.union(existing, global));
        }

        const shift = chunk.startSec - chunk.prefixSec;
        const main = sorted
            .filter((w) => w.start >= chunk.prefixSec)
            .map((w) => ({ ...w, start: w.start + shift, end: w.end + shift }));

        // 2. overlap with the previous chunk for labels left without an exemplar
        const previous = this.stored.at(-1);
        if (previous !== undefined) this.matchByOverlap(chunk, previous, main, assigned);

        // 3. new speakers
        const globalOf = (label: string): string => {
            const known = assigned.get(label);
            if (known !== undefined) return known;
            const created = this.create();
            assigned.set(label, created);
            return created;
        };

        this.stored.push({
            index: chunk.index,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            words: main.map((w) => ({ ...w, speaker: globalOf(w.speaker) })),
        });
    }

    /** Ingested chunks by index, speaker ids resolved to the current global speakers. */
    chunks(): RegisteredChunk[] {
        return [...this.stored]
            .sort((a, b) => a.index - b.index)
            .map((c) => ({
                ...c,
                words: c.words.map((w) => ({ ...w, speaker: this.find(w.speaker) })),
            }));
    }

    private matchByOverlap(
        chunk: IngestChunk,
        previous: RegisteredChunk,
        main: readonly ChunkWord[],
        assigned: Map<string, string>,
    ): void {
        const from = chunk.startSec;
        const to = previous.endSec;
        const before = previous.words.filter(
            (w) => w.start >= from - OVERLAP_START_TOLERANCE_SEC && w.start < to,
        );
        const votes = new Map<string, Map<string, number>>();
        for (const w of main) {
            if (w.start >= to || assigned.has(w.speaker)) continue;
            const text = normalize(w.text);
            if (text.length === 0) continue;
            const match = before.find(
                (p) =>
                    Math.abs(p.start - w.start) <= OVERLAP_START_TOLERANCE_SEC &&
                    normalize(p.text) === text,
            );
            if (!match) continue;
            const byGlobal = votes.get(w.speaker) ?? new Map<string, number>();
            const global = this.find(match.speaker);
            byGlobal.set(global, (byGlobal.get(global) ?? 0) + 1);
            votes.set(w.speaker, byGlobal);
        }

        const taken = new Set([...assigned.values()].map((id) => this.find(id)));
        const candidates = [...votes.entries()]
            .map(([label, byGlobal]) => {
                const top = [...byGlobal.entries()].sort((a, b) => b[1] - a[1])[0];
                return { label, global: top[0], count: top[1] };
            })
            .filter((c) => c.count >= MIN_SPEAKER_MATCH_WORDS)
            .sort((a, b) => b.count - a.count);
        for (const c of candidates) {
            if (taken.has(c.global)) continue;
            assigned.set(c.label, c.global);
            taken.add(c.global);
        }
    }

    /** At most `exemplarSec` from the middle of the run. */
    private trim({ speaker, startSec, endSec }: Run): SpeakerExemplar {
        if (endSec - startSec <= this.options.exemplarSec) {
            return { globalSpeakerId: speaker, startSec, endSec };
        }
        const mid = (startSec + endSec) / 2;
        const half = this.options.exemplarSec / 2;
        return { globalSpeakerId: speaker, startSec: mid - half, endSec: mid + half };
    }

    private create(): string {
        const id = `speaker-${String(this.nextId++)}`;
        this.parent.set(id, id);
        return id;
    }

    private order(id: string): number {
        return Number(id.slice('speaker-'.length));
    }

    private find(id: string): string {
        let root = id;
        while (this.parent.get(root) !== root) {
            const next = this.parent.get(root);
            if (next === undefined) return id;
            root = next;
        }
        this.parent.set(id, root);
        return root;
    }

    private union(a: string, b: string): string {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra === rb) return ra;
        const [root, child] = this.order(ra) < this.order(rb) ? [ra, rb] : [rb, ra];
        this.parent.set(child, root);
        return root;
    }
}

interface Run {
    readonly speaker: string;
    readonly startSec: number;
    readonly endSec: number;
}

/** Continuous runs of one speaker: no other speaker inside, pauses shorter than 1 s. */
function runs(words: readonly ChunkWord[]): Run[] {
    const sorted = [...words].sort((a, b) => a.start - b.start);
    const result: { speaker: string; startSec: number; endSec: number }[] = [];
    for (const w of sorted) {
        const current = result.at(-1);
        if (current?.speaker === w.speaker && w.start - current.endSec < MAX_WORD_GAP_SEC) {
            current.endSec = Math.max(current.endSec, w.end);
        } else {
            result.push({ speaker: w.speaker, startSec: w.start, endSec: w.end });
        }
    }
    return result;
}

function mostFrequent(values: readonly string[]): { value: string; count: number } | null {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    let top: { value: string; count: number } | null = null;
    for (const [value, count] of counts) {
        if (!top || count > top.count) top = { value, count };
    }
    return top;
}

function normalize(text: string): string {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
