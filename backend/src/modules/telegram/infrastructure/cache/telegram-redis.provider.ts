import {
    Inject,
    Injectable,
    Logger,
    type OnApplicationShutdown,
    type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../../../shared/config/env.schema';
import { TELEGRAM_REDIS } from './telegram-redis.token';

const REDIS_COMMAND_TIMEOUT_MS = 1000;

export const telegramRedisProvider: Provider = {
    provide: TELEGRAM_REDIS,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>): Redis => {
        const client = new Redis({
            host: config.get('REDIS_HOST', { infer: true }),
            port: config.get('REDIS_PORT', { infer: true }),
            password: config.get('REDIS_PASSWORD', { infer: true }),
            db: config.get('REDIS_DB', { infer: true }),
            lazyConnect: true,
            commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
            maxRetriesPerRequest: 1,
        });
        const logger = new Logger('TelegramRedis');
        client.on('error', (error: Error) => {
            logger.error(error.message);
        });
        return client;
    },
};

@Injectable()
export class TelegramRedisLifecycle implements OnApplicationShutdown {
    constructor(@Inject(TELEGRAM_REDIS) private readonly client: Redis) {}

    async onApplicationShutdown(): Promise<void> {
        if (this.client.status === 'ready') await this.client.quit();
        else this.client.disconnect();
    }
}
