import { Inject, Injectable, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../../shared/config/env.schema';
import { TELEGRAM_REDIS } from './telegram-redis.token';

const REDIS_COMMAND_TIMEOUT_MS = 1000;

export function createTelegramRedis(config: ConfigService<Env, true>, logger: PinoLogger): Redis {
    logger.setContext('TelegramRedis');
    const client = new Redis({
        host: config.get('REDIS_HOST', { infer: true }),
        port: config.get('REDIS_PORT', { infer: true }),
        password: config.get('REDIS_PASSWORD', { infer: true }),
        db: config.get('REDIS_DB', { infer: true }),
        lazyConnect: true,
        commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
        maxRetriesPerRequest: 1,
    });
    client.on('error', (error: Error) => {
        logger.error({ err: error }, 'Telegram Redis client failed');
    });
    return client;
}

export const telegramRedisProvider: Provider = {
    provide: TELEGRAM_REDIS,
    inject: [ConfigService, PinoLogger],
    useFactory: createTelegramRedis,
};

@Injectable()
export class TelegramRedisLifecycle implements OnApplicationShutdown {
    constructor(@Inject(TELEGRAM_REDIS) private readonly client: Redis) {}

    async onApplicationShutdown(): Promise<void> {
        if (this.client.status === 'ready') await this.client.quit();
        else this.client.disconnect();
    }
}
