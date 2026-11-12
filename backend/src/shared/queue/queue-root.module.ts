import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { Env } from '../config/env.schema';

// Единственное подключение BullMQ к Redis; модули регистрируют только свои очереди.
@Global()
@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', { infer: true }),
                    port: Number(config.get('REDIS_PORT', { infer: true })),
                    password: config.get<string | undefined>('REDIS_PASSWORD', { infer: true }),
                    db: Number(config.get('REDIS_DB', { infer: true })),
                },
            }),
        }),
    ],
    exports: [BullModule],
})
export class QueueRootModule {}
