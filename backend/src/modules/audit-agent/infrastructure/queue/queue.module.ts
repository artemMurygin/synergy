import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import { AuditQueuePort } from '../../domain/ports/audit-queue.port';
import { NotificationQueuePort } from '../../domain/ports/notification-queue.port';
import { AuditQueueAdapter } from './audit-queue.adapter';
import { DealSyncScheduler } from './deal-sync-scheduler';
import { NotificationQueueAdapter } from './notification-queue.adapter';
import { queueJobsGaugeProvider } from './queue-metrics';
import { QUEUE_NAMES } from './queue.constants';

const COMPLETED_RETENTION_COUNT = 1000;
const FAILED_RETENTION_COUNT = 5000;

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
        BullModule.registerQueueAsync(
            {
                name: QUEUE_NAMES.DEAL_SYNC,
                inject: [ConfigService],
                useFactory: (config: ConfigService<Env, true>) => ({
                    defaultJobOptions: {
                        attempts: config.get('DEAL_SYNC_ATTEMPTS', { infer: true }),
                        backoff: {
                            type: 'exponential',
                            delay: config.get('DEAL_SYNC_BACKOFF_MS', { infer: true }),
                        },
                        removeOnComplete: COMPLETED_RETENTION_COUNT,
                        removeOnFail: FAILED_RETENTION_COUNT,
                    },
                }),
            },
            {
                name: QUEUE_NAMES.AUDIT,
                inject: [ConfigService],
                useFactory: (config: ConfigService<Env, true>) => ({
                    defaultJobOptions: {
                        attempts: config.get('AUDIT_ATTEMPTS', { infer: true }),
                        backoff: {
                            type: 'exponential',
                            delay: config.get('AUDIT_BACKOFF_MS', { infer: true }),
                        },
                        removeOnComplete: true,
                        removeOnFail: true,
                    },
                }),
            },
            {
                name: QUEUE_NAMES.NOTIFICATION,
                inject: [ConfigService],
                useFactory: (config: ConfigService<Env, true>) => ({
                    defaultJobOptions: {
                        attempts: config.get('NOTIFICATION_ATTEMPTS', { infer: true }),
                        backoff: {
                            type: 'exponential',
                            delay: config.get('NOTIFICATION_BACKOFF_MS', { infer: true }),
                        },
                        removeOnComplete: COMPLETED_RETENTION_COUNT,
                        removeOnFail: FAILED_RETENTION_COUNT,
                    },
                }),
            },
        ),
    ],
    providers: [
        { provide: AuditQueuePort, useClass: AuditQueueAdapter },
        { provide: NotificationQueuePort, useClass: NotificationQueueAdapter },
        DealSyncScheduler,
        queueJobsGaugeProvider,
    ],
    exports: [AuditQueuePort, NotificationQueuePort, BullModule],
})
export class QueueModule {}
