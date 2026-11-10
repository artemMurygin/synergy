import { Redis, type RedisOptions } from 'ioredis';

const DEFAULT_REDIS_PORT = 6379;
const SCAN_BATCH_SIZE = 100;

export function testRedisOptions(): RedisOptions {
    const password = process.env.REDIS_PASSWORD;
    return {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? DEFAULT_REDIS_PORT),
        ...(password === undefined ? {} : { password }),
    };
}

export function isTestRedisRequired(): boolean {
    return process.env.REDIS_PORT !== undefined;
}

export async function connectTestRedis(): Promise<Redis | null> {
    const redis = new Redis({
        ...testRedisOptions(),
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
        await redis.connect();
        await redis.ping();
        return redis;
    } catch (error: unknown) {
        redis.disconnect();
        if (isTestRedisRequired()) {
            throw new Error('Redis from REDIS_HOST/REDIS_PORT is not reachable', { cause: error });
        }
        return null;
    }
}

export async function deleteTestRedisKeys(
    redis: Redis,
    patterns: readonly string[],
): Promise<void> {
    for (const pattern of patterns) {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                SCAN_BATCH_SIZE,
            );
            if (keys.length > 0) await redis.del(...keys);
            cursor = nextCursor;
        } while (cursor !== '0');
    }
}

export async function disconnectTestRedis(
    redis: Redis | null,
    patterns: readonly string[] = [],
): Promise<void> {
    if (redis === null) return;
    await deleteTestRedisKeys(redis, patterns);
    await redis.quit();
}
