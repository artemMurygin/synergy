import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { UpdateDeduplicatorPort } from '../../application/ports/update-deduplicator.port';
import { TELEGRAM_REDIS } from './telegram-redis.token';

const KEY_PREFIX = 'telegram:update:';
const PROCESSED_MARK = '1';
const DEDUPLICATION_TTL_SECONDS = 86_400;

@Injectable()
export class UpdateDeduplicator extends UpdateDeduplicatorPort {
    constructor(@Inject(TELEGRAM_REDIS) private readonly redis: Redis) {
        super();
    }

    async markProcessed(updateId: number): Promise<boolean> {
        const reply = await this.redis.set(
            KEY_PREFIX + String(updateId),
            PROCESSED_MARK,
            'EX',
            DEDUPLICATION_TTL_SECONDS,
            'NX',
        );
        return reply === 'OK';
    }
}
