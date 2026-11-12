import { describe, expect, it } from 'vitest';
import {
    loadFixture,
    overlapFixtureSchema,
    toChunkWords,
    type OverlapFixture,
} from '../testing/scribe-fixtures';
import { chunk, run } from '../testing/word-builders';
import type { ChunkWord } from './chunk-word';
import { MeetingTranscript } from './meeting-transcript';
import { planChunks } from './plan-chunks';
import { SpeakerRegistry } from './speaker-registry';
import { countSpeakers } from './transcript-segment';
import { TranscriptMerger } from './transcript-merger';

const OPTIONS = { maxExemplars: 8, exemplarSec: 10 };

function ingestFixture(fx: OverlapFixture): SpeakerRegistry {
    const registry = new SpeakerRegistry(OPTIONS);
    fx.chunks.forEach((c, i) => {
        registry.ingest(chunk(i, c.startSec, c.endSec), toChunkWords(c.words));
    });
    return registry;
}

function words(text: string): string[] {
    return text.split(' ');
}

describe('TranscriptMerger', () => {
    it('cuts at the middle of the overlap without repeats or losses (synthetic)', () => {
        const fx = loadFixture('synthetic-overlap.json', overlapFixtureSchema);

        const result = TranscriptMerger.merge(
            ingestFixture(fx),
            { overlapSec: fx.overlapSec },
            'rus',
            30,
        );

        expect(result.segments.map((s) => s.text)).toEqual(fx.expectedText);
        expect(result.segments.map((s) => s.speaker)).toEqual([1, 2, 3]);
        expect(result.segments[1]).toMatchObject({ startSec: 11, endSec: 18.5 });
        expect(result.segments.map((s) => s.seq)).toEqual([0, 1, 2]);
        expect(result).toMatchObject({ language: 'rus', durationSec: 30 });
    });

    it('keeps all words when the overlap is silent (synthetic)', () => {
        const fx = loadFixture('synthetic-silent-overlap.json', overlapFixtureSchema);

        const result = TranscriptMerger.merge(ingestFixture(fx), { overlapSec: 10 }, null, 30);

        expect(result.segments.map((s) => s.text)).toEqual(fx.expectedText);
        expect(result.segments.map((s) => s.speaker)).toEqual([1, 2]);
    });

    it('takes the left chunk before the middle and the right one after it (spike fixture)', () => {
        const fx = loadFixture('scribe-overlap.json', overlapFixtureSchema);
        const [a, b] = fx.chunks;
        const mid = b.startSec + fx.overlapSec / 2;
        const midOf = (w: ChunkWord): number => (w.start + w.end) / 2;
        const expected = [
            ...toChunkWords(a.words).filter((w) => midOf(w) < mid),
            ...toChunkWords(b.words).filter((w) => midOf(w) + b.startSec >= mid),
        ].map((w) => w.text);

        const result = TranscriptMerger.merge(ingestFixture(fx), fx, 'rus', 1170);

        expect(result.segments.flatMap((s) => words(s.text))).toEqual(expected);
    });

    it('splits segments on speaker change and numbers speakers by first appearance', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        const first = run('1', 0, 2);
        const second = run('0', 3, 5);
        const third = run('1', 6, 8);
        registry.ingest(chunk(0, 0, 600), [...third, ...first, ...second]);

        const result = TranscriptMerger.merge(registry, { overlapSec: 30 }, 'rus', 600);

        expect(result.segments.map((s) => s.speaker)).toEqual([1, 2, 1]);
        expect(result.segments.map((s) => s.text)).toEqual(
            [first, second, third].map((ws) => ws.map((w) => w.text).join(' ')),
        );
        expect(result.segments[0]).toMatchObject({
            seq: 0,
            startSec: 0,
            endSec: first[first.length - 1].end,
        });
    });

    it('gives an empty transcript that completes as no_speech', () => {
        const registry = new SpeakerRegistry(OPTIONS);
        registry.ingest(chunk(0, 0, 85), []);

        const result = TranscriptMerger.merge(registry, { overlapSec: 30 }, 'rus', 85);
        const transcript = MeetingTranscript.createPending({
            fileId: '00000000-0000-4000-8000-000000000001',
            ownerId: '00000000-0000-4000-8000-000000000002',
            now: new Date(0),
        });
        transcript.start();
        transcript.complete(result, new Date(1));

        expect(result.segments).toEqual([]);
        expect(transcript.status).toBe('no_speech');
    });

    it('merges three and more chunks', () => {
        const duration = 1500;
        const overlapSec = 30;
        // two speakers take turns every 10 s, one word per second
        const truth = Array.from({ length: duration }, (_, k) => ({
            text: `g${String(k)}`,
            start: k + 0.1,
            end: k + 0.6,
            who: Math.floor(k / 10) % 2,
        }));
        const registry = new SpeakerRegistry(OPTIONS);
        for (const plan of planChunks(duration, 600, overlapSec)) {
            const local = truth
                .filter((w) => w.start >= plan.startSec && w.end <= plan.endSec)
                .map((w) => ({
                    text: w.text,
                    start: w.start - plan.startSec,
                    end: w.end - plan.startSec,
                    // labels are local: odd chunks swap them
                    speaker: String(plan.index % 2 === 0 ? w.who : 1 - w.who),
                }));
            registry.ingest(chunk(plan.index, plan.startSec, plan.endSec), local);
        }

        const result = TranscriptMerger.merge(registry, { overlapSec }, 'rus', duration);

        expect(result.segments.flatMap((s) => words(s.text))).toEqual(truth.map((w) => w.text));
        expect(result.segments).toHaveLength(150);
        expect(countSpeakers(result.segments)).toBe(2);
        result.segments.forEach((s, i) => {
            expect(s.seq).toBe(i);
            expect(s.speaker).toBe(i % 2 === 0 ? 1 : 2);
        });
    });
});
