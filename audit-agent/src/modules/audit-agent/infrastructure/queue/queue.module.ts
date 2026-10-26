import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import { AUDIT_QUEUE } from './queue.constants';
import { AuditQueue } from '../../application/audit/audit-queue';
import { BullmqAuditQueue } from './bullmq-audit-queue';

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
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    removeOnComplete: 1000,
                    removeOnFail: 5000,
                },
            }),
        }),
        BullModule.registerQueue({ name: AUDIT_QUEUE }),
    ],
    providers: [{ provide: AuditQueue, useClass: BullmqAuditQueue }],
    exports: [AuditQueue],
})
export class QueueModule {}
