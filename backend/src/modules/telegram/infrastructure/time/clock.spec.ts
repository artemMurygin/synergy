import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClockPort } from '../../domain/ports/clock.port';
import { Clock } from './clock';

describe('Clock', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('implements the clock port', () => {
        expect(new Clock()).toBeInstanceOf(ClockPort);
    });

    it('returns the current time as a new date on every call', () => {
        vi.useFakeTimers({ now: new Date('2026-03-01T12:00:00.000Z') });
        const clock = new Clock();

        const first = clock.now();
        vi.advanceTimersByTime(1500);
        const second = clock.now();

        expect(first).toEqual(new Date('2026-03-01T12:00:00.000Z'));
        expect(second).toEqual(new Date('2026-03-01T12:00:01.500Z'));
        expect(first).not.toBe(second);
    });
});
