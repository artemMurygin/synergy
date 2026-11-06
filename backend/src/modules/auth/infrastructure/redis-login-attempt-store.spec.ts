import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisLoginAttemptStore } from './redis-login-attempt-store';

const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD === undefined ? {} : { password: process.env.REDIS_PASSWORD }),
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
});
redis.on('error', () => undefined);
let available = false;

describe('RedisLoginAttemptStore', () => {
    const prefix = `test:${randomUUID()}:`;

    beforeAll(async () => {
        try {
            await redis.connect();
            await redis.ping();
            available = true;
        } catch {
            available = false;
        }
    });

    afterAll(async () => {
        if (available) {
            const keys = await redis.keys(`${prefix}*`);
            if (keys.length > 0) await redis.del(...keys);
            await redis.quit();
        }
    });

    it('counts increments and reports the remaining window', async (ctx) => {
        if (!available) return ctx.skip();
        const store = new RedisLoginAttemptStore(redis, prefix);
        expect((await store.increment('k', 5000)).count).toBe(1);
        const state = await store.increment('k', 5000);
        expect(state.count).toBe(2);
        expect(state.retryAfterMs).toBeGreaterThan(0);
        expect(state.retryAfterMs).toBeLessThanOrEqual(5000);
    });

    it('counts a parallel burst without losing increments', async (ctx) => {
        if (!available) return ctx.skip();
        const store = new RedisLoginAttemptStore(redis, prefix);
        const states = await Promise.all(
            Array.from({ length: 40 }, () => store.increment('burst', 5000)),
        );
        expect(states.map((s) => s.count).sort((a, b) => a - b)).toEqual(
            Array.from({ length: 40 }, (_, i) => i + 1),
        );
    });

    it('does not extend the window on later increments', async (ctx) => {
        if (!available) return ctx.skip();
        const store = new RedisLoginAttemptStore(redis, prefix);
        await store.increment('w', 300);
        await new Promise((r) => setTimeout(r, 150));
        expect((await store.increment('w', 300)).retryAfterMs).toBeLessThanOrEqual(160);
        await new Promise((r) => setTimeout(r, 200));
        expect((await store.increment('w', 300)).count).toBe(1);
    });

    it('takes an attempt back and never goes below zero', async (ctx) => {
        if (!available) return ctx.skip();
        const store = new RedisLoginAttemptStore(redis, prefix);
        await store.increment('d', 5000);
        await store.increment('d', 5000);
        await store.decrement('d');
        expect((await store.increment('d', 5000)).count).toBe(2);
        await store.decrement('none');
        expect((await store.increment('none', 5000)).count).toBe(1);
    });
});
