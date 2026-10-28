import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.schema';
import { AuditMetricsPort } from './domain/ports/audit-metrics.port';
import { AuditDealUseCase } from './application/use-cases/audit-deal.use-case';
import { AuditToolsFactory } from './application/audit-tools.factory';
import { DeliverNotificationUseCase } from './application/use-cases/deliver-notification.use-case';
import {
    DEAL_SYNC_DEFAULT_WINDOW_MS,
    SyncDealsUseCase,
} from './application/use-cases/sync-deals.use-case';
import { AgentModule } from './infrastructure/agent/agent.module';
import { CrmModule } from './infrastructure/crm/crm.module';
import { AuditMetrics } from './infrastructure/metrics/audit-metrics';
import { auditMetricProviders } from './infrastructure/metrics/audit-metrics.constants';
import { AuditPersistenceModule } from './infrastructure/persistence/audit-persistence.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { SyncCursorModule } from './infrastructure/redis/sync-cursor.module';
import { TelegramModule } from './infrastructure/telegram/telegram.module';
import { AuditProcessor } from './interface/queue/audit.processor';
import { DealSyncProcessor } from './interface/queue/deal-sync.processor';
import { NotificationProcessor } from './interface/queue/notification.processor';

const MINUTE_MS = 60_000;

@Module({
    imports: [
        CrmModule,
        AuditPersistenceModule,
        SyncCursorModule,
        TelegramModule,
        QueueModule,
        AgentModule,
    ],
    providers: [
        ...auditMetricProviders,
        {
            provide: DEAL_SYNC_DEFAULT_WINDOW_MS,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): number =>
                config.get('DEAL_SYNC_DEFAULT_WINDOW_MINUTES', { infer: true }) * MINUTE_MS,
        },
        AuditToolsFactory,
        { provide: AuditMetricsPort, useClass: AuditMetrics },
        SyncDealsUseCase,
        AuditDealUseCase,
        DeliverNotificationUseCase,
        DealSyncProcessor,
        AuditProcessor,
        NotificationProcessor,
    ],
})
export class AuditAgentModule {}
