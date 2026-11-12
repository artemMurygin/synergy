import { describe, expect, it } from 'vitest';
import {
    loadFixture,
    overlapFixtureSchema,
    exemplarsFixtureSchema,
    toChunkWords,
} from '../testing/scribe-fixtures';
import { chunk, run } from '../testing/word-builders';
import type { ChunkWord } from './chunk-word';
import { SpeakerRegistry } from './speaker-registry';

const OPTIONS = { maxExemplars: 8, exemplarSec: 10 };

function speakerAt(registry: SpeakerRegistry, chunkIndex: number, start: number): string {
    const word = registry
        .chunks()
        .find((c) => c.index === chunkIndex)
        ?.words.find((w) => w.start === start);
    if (!word) throw new Error(`no word at ${String(start)}`);
    return word.speaker;
}

function countBySpeaker(registry: SpeakerRegistry, chunkIndex: number): Map<string, number> {
    const counts = new Map<string, number>();
    for (const w of registry.chunks().find((c) => c.index === chunkIndex)?.words ?? []) {
        counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
    }
    return counts;
}

/** First chunk with two known speakers: P talks at 100–110 s, Q at 200–210 s. */
function registryWithTwoSpeakers(): { registry: SpeakerRegistry; p: string; q: string } {
    const registry = new SpeakerRegistry(OPTIONS);
    registry.ingest(chunk(0, 0, 600), [...run('p', 100, 110), ...run('q', 200, 210)]);
    return { registry, p: speakerAt(registry, 0, 100), q: speakerAt(registry, 0, 200) };
}

describe('SpeakerRegistry.exemplars', () => {
    it('takes the longest continuous run, trimmed to 10 s from the middle, in absolute time', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        registry.ingest(chunk(1, 570, 1170, 3), [
            // file 5–17 s → absolute 572–584 s, 12 s long
            ...run('0', 5, 17),
            // gap of 3 s breaks the run; this one is only 5 s
            ...run('0', 20, 25),
            // 3 s: too short for an exemplar
            ...run('1', 30, 33),
        ]);
        const x = speakerAt(registry, 1, 572);

        // the run is 572–583.9 s, its middle is 577.95 s
        const exemplars = registry.exemplars();
        expect(exemplars).toHaveLength(1);
        expect(exemplars[0].globalSpeakerId).toBe(x);
        expect(exemplars[0].startSec).toBeCloseTo(572.95, 6);
        expect(exemplars[0].endSec).toBeCloseTo(582.95, 6);
    });

    it('keeps a run shorter than 10 s whole', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        registry.ingest(chunk(0, 0, 600), run('0', 10, 15));

        expect(registry.exemplars()).toEqual([
            { globalSpeakerId: speakerAt(registry, 0, 10), startSec: 10, endSec: 14.9 },
        ]);
    });

    it('gives no exemplar when pauses between words are 1 s or longer', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        registry.ingest(chunk(0, 0, 600), run('0', 0, 30, 1.5));

        expect(registry.exemplars()).toEqual([]);
    });

    it('limits exemplars to maxExemplars, the most talkative first', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        const words: ChunkWord[] = [];
        for (let i = 0; i < 10; i++) {
            words.push(...run(String(i), i * 30, i * 30 + 4.5 + i));
        }
        registry.ingest(chunk(0, 0, 600), words);
        const ids = Array.from({ length: 10 }, (_, i) => speakerAt(registry, 0, i * 30));

        const exemplars = registry.exemplars();

        expect(exemplars.map((e) => e.globalSpeakerId)).toEqual(ids.slice(2).reverse());
    });

    it('respects a custom maxExemplars', () => {
        const registry = new SpeakerRegistry({ maxExemplars: 1, exemplarSec: 10 });
        registry.ingest(chunk(0, 0, 600), [...run('0', 0, 5), ...run('1', 10, 30)]);

        expect(registry.exemplars()).toHaveLength(1);
        expect(registry.exemplars()[0].globalSpeakerId).toBe(speakerAt(registry, 0, 10));
    });
});

describe('SpeakerRegistry.ingest', () => {
    it('maps local labels by exemplars (spike fixture: exemplars 0 and 1)', () => {
        const fx = loadFixture('scribe-exemplars.json', exemplarsFixtureSchema);
        const { registry, p, q } = registryWithTwoSpeakers();
        const ids: Record<string, string> = { A0: p, A1: q };

        registry.ingest(
            chunk(
                1,
                fx.chunk.startSec,
                fx.chunk.endSec,
                fx.prefixSec,
                fx.exemplars.map((e) => ({
                    globalSpeakerId: ids[e.globalSpeaker],
                    startInFileSec: e.startInFileSec,
                    endInFileSec: e.endInFileSec,
                })),
            ),
            toChunkWords(fx.words),
        );

        const counts = countBySpeaker(registry, 1);
        expect(counts.get(p)).toBe(389);
        expect(counts.get(q)).toBe(109);
        const others = [...counts.keys()].filter((id) => id !== p && id !== q);
        expect(others).toHaveLength(1);
        expect(counts.get(others[0])).toBe(36);
    });

    it('drops prefix words and shifts the rest to absolute time', () => {
        const fx = loadFixture('scribe-exemplars.json', exemplarsFixtureSchema);
        const { registry, p, q } = registryWithTwoSpeakers();
        const words = toChunkWords(fx.words);
        const firstMain = words.find((w) => w.start >= fx.prefixSec);

        registry.ingest(
            chunk(1, fx.chunk.startSec, fx.chunk.endSec, fx.prefixSec, [
                { globalSpeakerId: p, startInFileSec: 0, endInFileSec: 10 },
                { globalSpeakerId: q, startInFileSec: 11, endInFileSec: 21 },
            ]),
            words,
        );

        const stored = registry.chunks().find((c) => c.index === 1)?.words ?? [];
        expect(stored).toHaveLength(534);
        expect(stored[0].start).toBeCloseTo((firstMain?.start ?? 0) + 570 - 22, 6);
        expect(Math.min(...stored.map((w) => w.start))).toBeGreaterThanOrEqual(570);
    });

    it('merges two global speakers when their exemplars get one local label', () => {
        const { registry, p, q } = registryWithTwoSpeakers();

        registry.ingest(
            chunk(1, 570, 1170, 12, [
                { globalSpeakerId: p, startInFileSec: 0, endInFileSec: 5 },
                { globalSpeakerId: q, startInFileSec: 6, endInFileSec: 11 },
            ]),
            [...run('0', 0, 5), ...run('0', 6, 11), ...run('0', 50, 60)],
        );

        expect(registry.exemplars().map((e) => e.globalSpeakerId)).toEqual([p]);
        expect(new Set(registry.chunks().flatMap((c) => c.words.map((w) => w.speaker)))).toEqual(
            new Set([p]),
        );
    });

    it('does not map a label that has less than 60% of the exemplar words', () => {
        const { registry, p } = registryWithTwoSpeakers();

        registry.ingest(
            chunk(1, 570, 1170, 11, [{ globalSpeakerId: p, startInFileSec: 0, endInFileSec: 10 }]),
            [...run('0', 0, 4.9), ...run('1', 5, 9.9), ...run('0', 50, 55), ...run('1', 60, 65)],
        );

        const counts = countBySpeaker(registry, 1);
        expect(counts.has(p)).toBe(false);
        expect(counts.size).toBe(2);
    });

    it('does not map a label with fewer than 3 exemplar words', () => {
        const { registry, p } = registryWithTwoSpeakers();

        registry.ingest(
            chunk(1, 570, 1170, 11, [{ globalSpeakerId: p, startInFileSec: 0, endInFileSec: 10 }]),
            [...run('0', 1, 2), ...run('0', 50, 55)],
        );

        expect(countBySpeaker(registry, 1).has(p)).toBe(false);
    });

    it('falls back to the overlap with at least 3 matched words (spike fixture)', () => {
        const fx = loadFixture('scribe-overlap.json', overlapFixtureSchema);
        const registry = new SpeakerRegistry(OPTIONS);
        const [a, b] = fx.chunks;
        const aWords = toChunkWords(a.words);
        const bWords = toChunkWords(b.words);

        registry.ingest(chunk(0, a.startSec, a.endSec), aWords);
        registry.ingest(chunk(1, b.startSec, b.endSec), bWords);

        const a0 = speakerAt(registry, 0, aWords.find((w) => w.speaker === '0')?.start ?? -1);
        const a1 = speakerAt(registry, 0, aWords.find((w) => w.speaker === '1')?.start ?? -1);
        const bId = (label: string): string =>
            speakerAt(registry, 1, (bWords.find((w) => w.speaker === label)?.start ?? -1) + 570);

        expect(bId('0')).toBe(a0);
        expect(new Set([bId('1'), bId('2')]).size).toBe(2);
        for (const id of [bId('1'), bId('2')]) {
            expect([a0, a1]).not.toContain(id);
        }
    });

    it('maps by shared words in the overlap (synthetic, text/speaker_id fields)', () => {
        const fx = loadFixture('synthetic-overlap.json', overlapFixtureSchema);
        const registry = new SpeakerRegistry(OPTIONS);
        const [a, b] = fx.chunks;

        registry.ingest(chunk(0, a.startSec, a.endSec), toChunkWords(a.words));
        registry.ingest(chunk(1, b.startSec, b.endSec), toChunkWords(b.words));

        expect(speakerAt(registry, 1, 11)).toBe(speakerAt(registry, 0, 11));
        expect(speakerAt(registry, 1, 21)).not.toBe(speakerAt(registry, 0, 1));
        expect(speakerAt(registry, 1, 21)).not.toBe(speakerAt(registry, 0, 11));
    });

    it('creates a new speaker when the overlap is silent (synthetic, word/speaker_label fields)', () => {
        const fx = loadFixture('synthetic-silent-overlap.json', overlapFixtureSchema);
        const registry = new SpeakerRegistry(OPTIONS);
        const [a, b] = fx.chunks;

        registry.ingest(chunk(0, a.startSec, a.endSec), toChunkWords(a.words));
        registry.ingest(chunk(1, b.startSec, b.endSec), toChunkWords(b.words));

        expect(speakerAt(registry, 1, 22)).not.toBe(speakerAt(registry, 0, 1));
    });

    it('does not give an overlap match to a speaker already taken by an exemplar', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        const first = run('a', 570, 599.5);
        registry.ingest(chunk(0, 0, 600), [...run('a', 100, 110), ...first]);
        const a = speakerAt(registry, 0, 100);

        // label 0 takes A by its exemplar; label 1 repeats A's overlap words but A is taken
        const prefix = 11;
        const second: ChunkWord[] = [
            ...run('0', 0, 10),
            ...first.map((w) => ({
                ...w,
                start: w.start - 570 + prefix,
                end: w.end - 570 + prefix,
                speaker: '1',
            })),
        ];
        registry.ingest(
            chunk(1, 570, 1170, prefix, [
                { globalSpeakerId: a, startInFileSec: 0, endInFileSec: 10 },
            ]),
            second,
        );

        const label1 = speakerAt(registry, 1, 570);
        expect(label1).not.toBe(a);
    });
});
