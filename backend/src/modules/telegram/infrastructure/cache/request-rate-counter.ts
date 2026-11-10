import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import {
    type RequestRate,
    RequestRateCounterPort,
} from '../../application/ports/request-rate-counter.port';
import { TELEGRAM_REDIS } from './telegram-redis.token';

const KEY_PREFIX = 'telegram:';

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}`;

const incrementReplySchema = z.tuple([z.number().int().positive(), z.number().int()]);

@Injectable()
export class RequestRateCounter extends RequestRateCounterPort {
    constructor(@Inject(TELEGRAM_REDIS) private readonly redis: Redis) {
        super();
    }

    async increment(key: string, windowMs: number): Promise<RequestRate> {
        const reply: unknown = await this.redis.eval(
            INCREMENT_SCRIPT,
            1,
            KEY_PREFIX + key,
            windowMs,
        );
        const [count, retryAfterMs] = incrementReplySchema.parse(reply);
        return { count, retryAfterMs };
    }
}
