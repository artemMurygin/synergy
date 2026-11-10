import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../errors';
import { DEFAULT_RETRY_DELAYS_MS, RetryPolicy } from './retry-policy';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

function delayMs(policy: RetryPolicy, attempt: number): number {
    return policy.nextAttemptAt(attempt, NOW).getTime() - NOW.getTime();
}

describe('RetryPolicy', () => {
    const policy = RetryPolicy.create({ maxAttempts: 10 });

    it('uses the default delays 1 s, 5 s, 30 s, 2 min, 10 min', () => {
        expect(DEFAULT_RETRY_DELAYS_MS).toEqual([
            SECOND_MS,
            5 * SECOND_MS,
            30 * SECOND_MS,
            2 * MINUTE_MS,
            10 * MINUTE_MS,
        ]);
    });

    it('schedules each failed attempt with its own delay', () => {
        expect(delayMs(policy, 1)).toBe(SECOND_MS);
        expect(delayMs(policy, 2)).toBe(5 * SECOND_MS);
        expect(delayMs(policy, 3)).toBe(30 * SECOND_MS);
        expect(delayMs(policy, 4)).toBe(2 * MINUTE_MS);
        expect(delayMs(policy, 5)).toBe(10 * MINUTE_MS);
    });

    it('keeps the last delay of 10 min after the listed ones run out', () => {
        expect(delayMs(policy, 6)).toBe(10 * MINUTE_MS);
        expect(delayMs(policy, 9)).toBe(10 * MINUTE_MS);
        expect(delayMs(policy, 50)).toBe(10 * MINUTE_MS);
    });

    it('never decreases the delay between attempts', () => {
        const delays = Array.from({ length: 20 }, (_, index) => delayMs(policy, index + 1));

        delays.slice(1).forEach((delay, index) => {
            expect(delay).toBeGreaterThanOrEqual(delays[index] ?? Number.POSITIVE_INFINITY);
        });
    });

    it('schedules the next attempt no earlier than the previous one', () => {
        let previousAt = NOW;
        let now = NOW;
        for (let attempt = 1; attempt <= 12; attempt += 1) {
            const nextAt = policy.nextAttemptAt(attempt, now);
            expect(nextAt.getTime()).toBeGreaterThanOrEqual(previousAt.getTime());
            previousAt = nextAt;
            now = nextAt;
        }
    });

    it('is exhausted once the attempt count reaches maxAttempts', () => {
        expect(policy.isExhausted(1)).toBe(false);
        expect(policy.isExhausted(9)).toBe(false);
        expect(policy.isExhausted(10)).toBe(true);
        expect(policy.isExhausted(11)).toBe(true);
    });

    it('accepts custom delays', () => {
        const custom = RetryPolicy.create({ maxAttempts: 3, delaysMs: [100, 200] });

        expect(delayMs(custom, 1)).toBe(100);
        expect(delayMs(custom, 2)).toBe(200);
        expect(delayMs(custom, 3)).toBe(200);
        expect(custom.isExhausted(3)).toBe(true);
    });

    it('rejects an attempt number below 1', () => {
        expect(() => policy.nextAttemptAt(0, NOW)).toThrow(ArgumentInvalidError);
        expect(() => policy.isExhausted(-1)).toThrow(ArgumentInvalidError);
    });

    it('rejects invalid settings', () => {
        expect(() => RetryPolicy.create({ maxAttempts: 0 })).toThrow(ArgumentInvalidError);
        expect(() => RetryPolicy.create({ maxAttempts: 1.5 })).toThrow(ArgumentInvalidError);
        expect(() => RetryPolicy.create({ maxAttempts: 3, delaysMs: [] })).toThrow(
            ArgumentInvalidError,
        );
        expect(() => RetryPolicy.create({ maxAttempts: 3, delaysMs: [-1] })).toThrow(
            ArgumentInvalidError,
        );
        expect(() => RetryPolicy.create({ maxAttempts: 3, delaysMs: [500, 100] })).toThrow(
            ArgumentInvalidError,
        );
    });
});
