import { Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../../../shared/config/env.schema';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import { REDIS_CLIENT } from './redis.constants';
import { SyncCursorRepository } from './sync-cursor-repository';

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
    constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

    async onApplicationShutdown(): Promise<void> {
        await this.client.quit();
    }
}

@Module({
    providers: [
        {
            provide: REDIS_CLIENT,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): Redis =>
                new Redis({
                    host: config.get('REDIS_HOST', { infer: true }),
                    port: config.get('REDIS_PORT', { infer: true }),
                    password: config.get('REDIS_PASSWORD', { infer: true }),
                    db: config.get('REDIS_DB', { infer: true }),
                }),
        },
        RedisLifecycle,
        { provide: SyncCursorRepositoryPort, useClass: SyncCursorRepository },
    ],
    exports: [SyncCursorRepositoryPort],
})
export class SyncCursorModule {}
