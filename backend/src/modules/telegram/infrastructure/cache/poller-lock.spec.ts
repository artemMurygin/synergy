import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestRedis, disconnectTestRedis } from '../../../../shared/testing/test-redis';
import { POLLER_LOCK_KEY, PollerLock } from './poller-lock';

const LOCK_TTL_MS = 60_000;
const TEST_KEY = `telegram:poller:lock:test-${randomUUID()}`;

describe('PollerLock (real Redis)', () => {
    let redis: Redis | null = null;

    beforeAll(async () => {
        redis = await connectTestRedis();
    });

    afterAll(async () => {
        await disconnectTestRedis(redis, [TEST_KEY]);
    });

    beforeEach(async (ctx) => {
        if (redis === null) {
            ctx.skip();
            return;
        }
        await redis.del(TEST_KEY);
    });

    function connected(): Redis {
        if (redis === null) throw new Error('Redis is not connected');
        return redis;
    }

    it('uses the key telegram:poller:lock by default with a TTL, and only one holder wins', async () => {
        const first = new PollerLock(connected(), TEST_KEY);
        const second = new PollerLock(connected(), TEST_KEY);

        expect(await first.acquire(LOCK_TTL_MS)).toBe(true);
        expect(await second.acquire(LOCK_TTL_MS)).toBe(false);

        expect(POLLER_LOCK_KEY).toBe('telegram:poller:lock');
        expect(new PollerLock(connected()).key).toBe(POLLER_LOCK_KEY);
        const ttlMs = await connected().pttl(TEST_KEY);
        expect(ttlMs).toBeGreaterThan(LOCK_TTL_MS - 5_000);
        expect(ttlMs).toBeLessThanOrEqual(LOCK_TTL_MS);
    });

    it('extends only its own lock', async () => {
        const holder = new PollerLock(connected(), TEST_KEY);
        const other = new PollerLock(connected(), TEST_KEY);
        await holder.acquire(1_000);

        expect(await holder.extend(LOCK_TTL_MS)).toBe(true);
        expect(await other.extend(LOCK_TTL_MS)).toBe(false);
        expect(await connected().pttl(TEST_KEY)).toBeGreaterThan(1_000);
    });

    it('fails to extend after the lock was taken by someone else', async () => {
        const holder = new PollerLock(connected(), TEST_KEY);
        await holder.acquire(LOCK_TTL_MS);
        await connected().set(TEST_KEY, 'foreign-owner', 'PX', LOCK_TTL_MS);

        expect(await holder.extend(LOCK_TTL_MS)).toBe(false);
        expect(await connected().get(TEST_KEY)).toBe('foreign-owner');
    });

    it('releases only its own lock', async () => {
        const holder = new PollerLock(connected(), TEST_KEY);
        const other = new PollerLock(connected(), TEST_KEY);
        await holder.acquire(LOCK_TTL_MS);

        await other.release();
        expect(await connected().exists(TEST_KEY)).toBe(1);

        await holder.release();
        expect(await connected().exists(TEST_KEY)).toBe(0);
        expect(await other.acquire(LOCK_TTL_MS)).toBe(true);
    });
});
