import { describe, expect, it } from 'vitest';
import { TranscriptionUsage } from './transcription-usage';

describe('TranscriptionUsage', () => {
    it('adds seconds and known costs', () => {
        expect(
            TranscriptionUsage.add({ seconds: 10, cost: 0.5 }, { seconds: 5, cost: 0.25 }),
        ).toEqual({ seconds: 15, cost: 0.75 });
    });

    it('keeps an unknown cost as null instead of 0', () => {
        expect(
            TranscriptionUsage.add({ seconds: 10, cost: null }, { seconds: 5, cost: 1 }),
        ).toEqual({
            seconds: 15,
            cost: null,
        });
        expect(
            TranscriptionUsage.add({ seconds: 0, cost: 0 }, { seconds: 60, cost: null }),
        ).toEqual({
            seconds: 60,
            cost: null,
        });
    });

    it('ignores a missing part', () => {
        const total = { seconds: 3, cost: null };
        expect(TranscriptionUsage.add(total, null)).toBe(total);
    });
});
