import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestRedis, disconnectTestRedis } from '../../../../shared/testing/test-redis';
import { LinkToken } from '../../domain/link-token';
import { LinkTokenStore } from './link-token-store';

const KEY_PATTERN = 'telegram:link-token:*';
const TTL_SECONDS = 600;
const NOW = new Date('2026-03-01T10:00:00.000Z');

describe('LinkTokenStore', () => {
    let redis: Redis | null = null;

    beforeAll(async () => {
        redis = await connectTestRedis();
    });

    afterAll(() => disconnectTestRedis(redis, [KEY_PATTERN]));

    function storeOf(client: Redis | null, skip: () => void): LinkTokenStore {
        if (client === null) {
            skip();
            throw new Error('Redis is not available');
        }
        return new LinkTokenStore(client);
    }

    function freshToken(): LinkToken {
        return LinkToken.generate(TTL_SECONDS, NOW);
    }

    it('stores the user id under telegram:link-token:<digest> with the TTL', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());
        const token = freshToken();
        const userId = randomUUID();

        await store.save(token.digest(), userId, TTL_SECONDS);

        const key = `telegram:link-token:${token.digest()}`;
        expect(await redis?.get(key)).toBe(userId);
        const ttlSeconds = await redis?.ttl(key);
        expect(ttlSeconds).toBeGreaterThan(TTL_SECONDS - 5);
        expect(ttlSeconds).toBeLessThanOrEqual(TTL_SECONDS);
    });

    it('never stores the plain token in Redis', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());
        const token = freshToken();

        await store.save(token.digest(), randomUUID(), TTL_SECONDS);

        expect(await redis?.keys(`*${token.value}*`)).toEqual([]);
        const keys = (await redis?.keys(KEY_PATTERN)) ?? [];
        for (const key of keys) {
            expect(await redis?.get(key)).not.toBe(token.value);
        }
    });

    it('consumes a token once and answers null on the second call', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());
        const token = freshToken();
        const userId = randomUUID();
        await store.save(token.digest(), userId, TTL_SECONDS);

        expect(await store.consume(token.digest())).toBe(userId);
        expect(await store.consume(token.digest())).toBeNull();
        expect(await redis?.exists(`telegram:link-token:${token.digest()}`)).toBe(0);
    });

    it('answers null for an unknown token', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());

        expect(await store.consume(freshToken().digest())).toBeNull();
    });

    it('lets only one of two concurrent consumes succeed', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());
        const token = freshToken();
        const userId = randomUUID();
        await store.save(token.digest(), userId, TTL_SECONDS);

        const results = await Promise.all([
            store.consume(token.digest()),
            store.consume(token.digest()),
        ]);

        expect(results.filter((result) => result === userId)).toHaveLength(1);
        expect(results.filter((result) => result === null)).toHaveLength(1);
    });

    it('keeps several tokens of one user independent', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());
        const userId = randomUUID();
        const first = freshToken();
        const second = freshToken();
        await store.save(first.digest(), userId, TTL_SECONDS);
        await store.save(second.digest(), userId, TTL_SECONDS);

        expect(await store.consume(first.digest())).toBe(userId);
        expect(await store.consume(second.digest())).toBe(userId);
    });

    it('expires the token after the TTL', async (ctx) => {
        const store = storeOf(redis, () => ctx.skip());
        const token = freshToken();
        await store.save(token.digest(), randomUUID(), 1);

        await new Promise((resolve) => setTimeout(resolve, 1_100));

        expect(await store.consume(token.digest())).toBeNull();
    });
});
