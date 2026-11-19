import type { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import {
    VoiceRateLimiterPort,
    type VoiceRateDecision,
} from '../../domain/ports/voice-rate-limiter.port';

export const VOICE_RATE_WINDOW_MS = 60_000;

// Fixed window: the first request sets the expiry, later ones only count.
const INCREMENT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}`;

export interface RedisVoiceRateLimiterSettings {
    /** Requests per user in the 60 second window. */
    readonly limit: number;
    readonly prefix?: string;
}

/** Fixed 60 second window per user in Redis. When Redis fails the request is allowed. */
export class RedisVoiceRateLimiter extends VoiceRateLimiterPort {
    private readonly prefix: string;

    constructor(
        private readonly redis: Pick<Redis, 'eval'>,
        private readonly settings: RedisVoiceRateLimiterSettings,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.prefix = settings.prefix ?? 'voice-rate:';
        this.logger.setContext(RedisVoiceRateLimiter.name);
    }

    async acquire(userId: string): Promise<VoiceRateDecision> {
        try {
            const [count, ttlMs] = (await this.redis.eval(
                INCREMENT,
                1,
                this.prefix + userId,
                VOICE_RATE_WINDOW_MS,
            )) as [number, number];
            if (count <= this.settings.limit) return { allowed: true, retryAfterSec: 0 };
            return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)) };
        } catch (error: unknown) {
            this.logger.error(
                { err: { type: error instanceof Error ? error.name : 'unknown' } },
                'Voice rate limiter is unavailable, request allowed',
            );
            return { allowed: true, retryAfterSec: 0 };
        }
    }
}
