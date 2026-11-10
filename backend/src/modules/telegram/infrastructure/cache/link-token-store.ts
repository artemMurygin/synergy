import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { LinkTokenStorePort } from '../../domain/ports/link-token-store.port';
import { TELEGRAM_REDIS } from './telegram-redis.token';

const KEY_PREFIX = 'telegram:link-token:';

@Injectable()
export class LinkTokenStore extends LinkTokenStorePort {
    constructor(@Inject(TELEGRAM_REDIS) private readonly redis: Redis) {
        super();
    }

    async save(digest: string, userId: string, ttlSeconds: number): Promise<void> {
        await this.redis.set(KEY_PREFIX + digest, userId, 'EX', ttlSeconds);
    }

    async consume(digest: string): Promise<string | null> {
        return this.redis.getdel(KEY_PREFIX + digest);
    }
}
