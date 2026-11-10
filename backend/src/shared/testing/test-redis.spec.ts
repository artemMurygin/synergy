import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestRedis, deleteTestRedisKeys, disconnectTestRedis } from './test-redis';

describe('test redis helper', () => {
    const namespace = `test:${randomUUID()}`;
    let redis: Redis | null = null;

    beforeAll(async () => {
        redis = await connectTestRedis();
    });

    afterAll(async () => {
        await disconnectTestRedis(redis, [`${namespace}:*`]);
    });

    it('connects to the redis from REDIS_HOST and REDIS_PORT', async (ctx) => {
        if (redis === null) return ctx.skip();
        expect(await redis.ping()).toBe('PONG');
    });

    it('deletes only the keys matching the given patterns', async (ctx) => {
        const client = redis;
        if (client === null) return ctx.skip();
        const keys = Array.from({ length: 150 }, (_, i) => `${namespace}:gone:${String(i)}`);
        await Promise.all(keys.map((key) => client.set(key, '1', 'EX', 60)));
        await client.set(`${namespace}:kept`, '1', 'EX', 60);

        await deleteTestRedisKeys(client, [`${namespace}:gone:*`]);

        expect(await client.exists(...keys)).toBe(0);
        expect(await client.exists(`${namespace}:kept`)).toBe(1);
    });
});
