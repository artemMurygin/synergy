import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    connectTestRedis,
    deleteTestRedisKeys,
    disconnectTestRedis,
} from '../../../../shared/testing/test-redis';
import { recordingLogger } from '../../application/test-doubles';
import { RedisVoiceRateLimiter } from './redis-voice-rate-limiter';

describe('RedisVoiceRateLimiter', () => {
    const prefix = `test:${randomUUID()}:`;
    let redis: Redis | null = null;

    beforeAll(async () => {
        redis = await connectTestRedis();
    });
    afterAll(async () => {
        await disconnectTestRedis(redis, [`${prefix}*`]);
    });

    const make = (
        limit: number,
        client: Pick<Redis, 'eval'>,
        log = recordingLogger(),
    ): RedisVoiceRateLimiter => new RedisVoiceRateLimiter(client, { limit, prefix }, log.logger);

    it('allows up to the limit and then reports the wait', async (ctx) => {
        if (redis === null) return ctx.skip();
        const limiter = make(3, redis);
        for (let i = 0; i < 3; i++) {
            expect(await limiter.acquire('u1')).toEqual({ allowed: true, retryAfterSec: 0 });
        }
        const denied = await limiter.acquire('u1');
        expect(denied.allowed).toBe(false);
        expect(denied.retryAfterSec).toBeGreaterThan(0);
        expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
    });

    it('counts users independently', async (ctx) => {
        if (redis === null) return ctx.skip();
        const limiter = make(1, redis);
        expect((await limiter.acquire('a')).allowed).toBe(true);
        expect((await limiter.acquire('a')).allowed).toBe(false);
        expect((await limiter.acquire('b')).allowed).toBe(true);
    });

    it('keeps a 60 second window under the user key', async (ctx) => {
        if (redis === null) return ctx.skip();
        await make(5, redis).acquire('ttl');
        const ttl = await redis.pttl(`${prefix}ttl`);
        expect(ttl).toBeGreaterThan(55_000);
        expect(ttl).toBeLessThanOrEqual(60_000);
    });

    it('allows the request and logs when Redis is unavailable', async () => {
        const log = recordingLogger();
        const broken = { eval: () => Promise.reject(new Error('ECONNREFUSED')) };
        const decision = await make(1, broken, log).acquire('u');
        expect(decision).toEqual({ allowed: true, retryAfterSec: 0 });
        expect(log.error.mock.calls.length + log.warn.mock.calls.length).toBe(1);
    });

    it('cleans its keys', async (ctx) => {
        if (redis === null) return ctx.skip();
        await deleteTestRedisKeys(redis, [`${prefix}*`]);
        expect(await redis.keys(`${prefix}*`)).toEqual([]);
    });
});
