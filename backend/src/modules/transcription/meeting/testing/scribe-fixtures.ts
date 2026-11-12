import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ChunkWord } from '../domain/chunk-word';

const label = z.union([z.number(), z.string()]);

/**
 * A provider word as found in the fixtures. The word may come as `word` or `text`,
 * the speaker as `speaker`, `speaker_id` or `speaker_label` (`0` and `speaker_0` are the same).
 */
const scribeWordSchema = z
    .object({
        word: z.string().optional(),
        text: z.string().optional(),
        start: z.number(),
        end: z.number(),
        speaker: label.optional(),
        speaker_id: label.optional(),
        speaker_label: label.optional(),
    })
    .transform((w) => ({
        text: (w.word ?? w.text ?? '').trim(),
        start: w.start,
        end: w.end,
        speaker: normalizeSpeakerLabel(w.speaker ?? w.speaker_id ?? w.speaker_label ?? 0),
    }));

export function normalizeSpeakerLabel(value: number | string): string {
    const raw = String(value).trim();
    return /^speaker_\d+$/.test(raw) ? raw.slice('speaker_'.length) : raw;
}

/** Validates provider words and drops blank ones. */
export function toChunkWords(raw: unknown): ChunkWord[] {
    return z
        .array(scribeWordSchema)
        .parse(raw)
        .filter((w) => w.text.length > 0);
}

const fixtureChunkSchema = z.object({
    startSec: z.number(),
    endSec: z.number(),
    words: z.array(z.unknown()),
});

export const overlapFixtureSchema = z.object({
    overlapSec: z.number(),
    chunks: z.array(fixtureChunkSchema),
    expectedText: z.array(z.string()).optional(),
});

export const exemplarsFixtureSchema = z.object({
    chunk: z.object({ startSec: z.number(), endSec: z.number() }),
    prefixSec: z.number(),
    exemplars: z.array(
        z.object({
            globalSpeaker: z.string(),
            startInFileSec: z.number(),
            endInFileSec: z.number(),
        }),
    ),
    words: z.array(z.unknown()),
});

export type FixtureChunk = z.infer<typeof fixtureChunkSchema>;
export type OverlapFixture = z.infer<typeof overlapFixtureSchema>;
export type ExemplarsFixture = z.infer<typeof exemplarsFixtureSchema>;

export function loadFixture<TFixture>(name: string, schema: z.ZodType<TFixture>): TFixture {
    const raw: unknown = JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
    return schema.parse(raw);
}
