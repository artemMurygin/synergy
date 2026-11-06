import type { Redis } from 'ioredis';
import { type AttemptState, LoginAttemptStore } from '../domain/ports/login-attempt-store.port';

const INCREMENT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}`;

const DECREMENT = `
if redis.call('EXISTS', KEYS[1]) == 1 and redis.call('DECR', KEYS[1]) <= 0 then
    redis.call('DEL', KEYS[1])
end
return 1`;

export class RedisLoginAttemptStore extends LoginAttemptStore {
    constructor(
        private readonly redis: Redis,
        private readonly prefix = 'auth:login-attempts:',
    ) {
        super();
    }

    async increment(key: string, windowMs: number): Promise<AttemptState> {
        const [count, ttl] = (await this.redis.eval(INCREMENT, 1, this.prefix + key, windowMs)) as [
            number,
            number,
        ];
        return { count, retryAfterMs: ttl };
    }

    async decrement(key: string): Promise<void> {
        await this.redis.eval(DECREMENT, 1, this.prefix + key);
    }
}
