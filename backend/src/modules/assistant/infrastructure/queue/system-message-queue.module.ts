import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { DefaultJobOptions } from 'bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import { SYSTEM_MESSAGE_QUEUE_NAME } from './system-message-queue.constants';

const COMPLETED_RETENTION_COUNT = 100;
const FAILED_RETENTION_COUNT = 500;

/** A fixed delay between attempts, as many attempts as fit into the deadline (plus the first one). */
export function systemMessageJobOptions(config: ConfigService<Env, true>): DefaultJobOptions {
    const retryMs = config.get('CHAT_SYSTEM_MESSAGE_RETRY_MS', { infer: true });
    const deadlineMs = config.get('CHAT_SYSTEM_MESSAGE_DEADLINE_MS', { infer: true });
    return {
        attempts: Math.ceil(deadlineMs / retryMs) + 1,
        backoff: { type: 'fixed', delay: retryMs },
        removeOnComplete: COMPLETED_RETENTION_COUNT,
        removeOnFail: FAILED_RETENTION_COUNT,
    };
}

// Подключение к Redis — в общем QueueRootModule; здесь только очередь сообщений системы.
@Module({
    imports: [
        BullModule.registerQueueAsync({
            name: SYSTEM_MESSAGE_QUEUE_NAME,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                defaultJobOptions: systemMessageJobOptions(config),
            }),
        }),
    ],
    exports: [BullModule],
})
export class SystemMessageQueueModule {}
