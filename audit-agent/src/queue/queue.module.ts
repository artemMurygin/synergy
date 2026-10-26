import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { Env } from '../config/env.schema';
import { AUDIT_QUEUE } from './queue.constants';
import { AuditProcessor } from './audit.processor';
import { AuditController } from './audit.controller';
import { AgentModule } from '../agent/agent.module';

@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                connection: {
                    host: config.get('REDIS_HOST', { infer: true }),
                    port: config.get('REDIS_PORT', { infer: true }),
                    password: config.get('REDIS_PASSWORD', { infer: true }),
                    db: config.get('REDIS_DB', { infer: true }),
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
        AgentModule,
    ],
    controllers: [AuditController],
    providers: [AuditProcessor],
})
export class QueueModule {}
