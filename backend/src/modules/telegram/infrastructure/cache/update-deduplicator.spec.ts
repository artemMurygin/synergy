import { randomInt } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestRedis, disconnectTestRedis } from '../../../../shared/testing/test-redis';
import { UpdateDeduplicator } from './update-deduplicator';

const KEY_PATTERN = 'telegram:update:*';
const DEDUPLICATION_TTL_SECONDS = 86_400;
const MAX_TEST_UPDATE_ID = 2 ** 40;

function uniqueUpdateId(): number {
    return randomInt(1, MAX_TEST_UPDATE_ID);
}

describe('UpdateDeduplicator', () => {
    let redis: Redis | null = null;

    beforeAll(async () => {
        redis = await connectTestRedis();
    });

    afterAll(() => disconnectTestRedis(redis, [KEY_PATTERN]));

    function deduplicatorOf(client: Redis | null, skip: () => void): UpdateDeduplicator {
        if (client === null) {
            skip();
            throw new Error('Redis is not available');
        }
        return new UpdateDeduplicator(client);
    }

    it('accepts a new update and stores telegram:update:<id> for a day', async (ctx) => {
        const deduplicator = deduplicatorOf(redis, () => ctx.skip());
        const updateId = uniqueUpdateId();

        expect(await deduplicator.markProcessed(updateId)).toBe(true);

        const key = `telegram:update:${String(updateId)}`;
        expect(await redis?.exists(key)).toBe(1);
        const ttlSeconds = await redis?.ttl(key);
        expect(ttlSeconds).toBeGreaterThan(DEDUPLICATION_TTL_SECONDS - 5);
        expect(ttlSeconds).toBeLessThanOrEqual(DEDUPLICATION_TTL_SECONDS);
    });

    it('answers false for a repeated update', async (ctx) => {
        const deduplicator = deduplicatorOf(redis, () => ctx.skip());
        const updateId = uniqueUpdateId();
        await deduplicator.markProcessed(updateId);

        expect(await deduplicator.markProcessed(updateId)).toBe(false);
    });

    it('does not extend the TTL of an already seen update', async (ctx) => {
        const deduplicator = deduplicatorOf(redis, () => ctx.skip());
        const updateId = uniqueUpdateId();
        const key = `telegram:update:${String(updateId)}`;
        await deduplicator.markProcessed(updateId);
        await redis?.expire(key, 100);

        await deduplicator.markProcessed(updateId);

        expect(await redis?.ttl(key)).toBeLessThanOrEqual(100);
    });

    it('accepts only one of two concurrent deliveries of the same update', async (ctx) => {
        const deduplicator = deduplicatorOf(redis, () => ctx.skip());
        const updateId = uniqueUpdateId();

        const results = await Promise.all([
            deduplicator.markProcessed(updateId),
            deduplicator.markProcessed(updateId),
        ]);

        expect(results.filter((isNew) => isNew)).toHaveLength(1);
    });

    it('treats different update ids independently', async (ctx) => {
        const deduplicator = deduplicatorOf(redis, () => ctx.skip());
        const updateId = uniqueUpdateId();

        expect(await deduplicator.markProcessed(updateId)).toBe(true);
        expect(await deduplicator.markProcessed(updateId + 1)).toBe(true);
    });
});
