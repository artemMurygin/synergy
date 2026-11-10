import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestRedis, disconnectTestRedis } from '../../../../shared/testing/test-redis';
import { RequestRateCounter } from './request-rate-counter';

const KEY_PATTERN = 'telegram:rate-test:*';
const WINDOW_MS = 60_000;

describe('RequestRateCounter (real Redis)', () => {
    let redis: Redis | null = null;

    beforeAll(async () => {
        redis = await connectTestRedis();
    });

    afterAll(() => disconnectTestRedis(redis, [KEY_PATTERN]));

    function counterOf(skip: () => void): { counter: RequestRateCounter; client: Redis } {
        if (redis === null) {
            skip();
            throw new Error('Redis is not available');
        }
        return { counter: new RequestRateCounter(redis), client: redis };
    }

    it('counts requests under telegram:<entity>:<id> in a fixed window with a TTL', async (ctx) => {
        const { counter, client } = counterOf(() => ctx.skip());
        const key = `rate-test:${randomUUID()}`;

        const first = await counter.increment(key, WINDOW_MS);
        const second = await counter.increment(key, WINDOW_MS);

        expect(first.count).toBe(1);
        expect(second.count).toBe(2);
        expect(second.retryAfterMs).toBeGreaterThan(WINDOW_MS - 5_000);
        expect(second.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
        const ttlMs = await client.pttl(`telegram:${key}`);
        expect(ttlMs).toBeGreaterThan(0);
        expect(ttlMs).toBeLessThanOrEqual(WINDOW_MS);
    });

    it('starts a new window after the previous one expires', async (ctx) => {
        const { counter } = counterOf(() => ctx.skip());
        const key = `rate-test:${randomUUID()}`;
        await counter.increment(key, 50);
        await new Promise((resolve) => setTimeout(resolve, 120));

        expect((await counter.increment(key, WINDOW_MS)).count).toBe(1);
    });
});
