import { describe, expect, it, vi } from 'vitest';
import { LinkTokenRateLimitedError } from './errors';
import {
    LINK_TOKEN_REQUESTS_PER_WINDOW,
    LINK_TOKEN_WINDOW_MS,
    LinkTokenThrottler,
} from './link-token-throttler';
import { type RequestRate, RequestRateCounterPort } from './ports/request-rate-counter.port';
import { silentLogger } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const OTHER_USER_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

class InMemoryRequestRateCounter extends RequestRateCounterPort {
    readonly countsByKey = new Map<string, number>();
    readonly windows: number[] = [];
    retryAfterMs = 30_500;
    failure: Error | null = null;

    increment(key: string, windowMs: number): Promise<RequestRate> {
        if (this.failure !== null) return Promise.reject(this.failure);
        this.windows.push(windowMs);
        const count = (this.countsByKey.get(key) ?? 0) + 1;
        this.countsByKey.set(key, count);
        return Promise.resolve({ count, retryAfterMs: this.retryAfterMs });
    }
}

async function acquireTimes(throttler: LinkTokenThrottler, times: number): Promise<void> {
    for (let attempt = 0; attempt < times; attempt += 1) await throttler.acquire(USER_ID);
}

describe('LinkTokenThrottler', () => {
    it('allows 10 link requests a minute per user', async () => {
        const counter = new InMemoryRequestRateCounter();
        const throttler = new LinkTokenThrottler(counter, silentLogger());

        await expect(acquireTimes(throttler, 10)).resolves.toBeUndefined();

        expect(LINK_TOKEN_REQUESTS_PER_WINDOW).toBe(10);
        expect(LINK_TOKEN_WINDOW_MS).toBe(60_000);
        expect(new Set(counter.windows)).toEqual(new Set([60_000]));
        expect([...counter.countsByKey.keys()]).toEqual([`link-token-rate:${USER_ID}`]);
    });

    it('rejects the 11th request with the wait rounded up to seconds', async () => {
        const counter = new InMemoryRequestRateCounter();
        const throttler = new LinkTokenThrottler(counter, silentLogger());
        await acquireTimes(throttler, 10);

        const rejection = await throttler.acquire(USER_ID).catch((error: unknown) => error);

        expect(rejection).toBeInstanceOf(LinkTokenRateLimitedError);
        expect(rejection).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 31 });
    });

    it('counts every user separately', async () => {
        const throttler = new LinkTokenThrottler(new InMemoryRequestRateCounter(), silentLogger());
        await acquireTimes(throttler, 10);

        await expect(throttler.acquire(OTHER_USER_ID)).resolves.toBeUndefined();
    });

    it('does not enforce the limit when the counter is unavailable, and logs it', async () => {
        const counter = new InMemoryRequestRateCounter();
        counter.failure = new Error('connection refused');
        const logger = silentLogger();
        const error = vi.spyOn(logger, 'error');
        const throttler = new LinkTokenThrottler(counter, logger);

        await expect(throttler.acquire(USER_ID)).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(
            { err: counter.failure },
            'Telegram rate counter unavailable, limit not enforced',
        );
    });
});
