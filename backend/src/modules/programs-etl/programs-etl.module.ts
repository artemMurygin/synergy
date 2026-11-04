import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import type {
    CatalogWriterPort,
    GroupRegistryPort,
    ProgramsAgentPort,
    ProgramsSyncLoggerPort,
    ProgramsSyncMetricsPort,
    ProgramsSyncQueuePort,
    SheetsReaderPort,
    SourceStateRepositoryPort,
    SyncRunStorePort,
} from './application/ports/programs-etl.ports';
import { ScheduleProgramsGroupSyncService } from './application/services/schedule-programs-group-sync.service';
import { RetryProgramsSyncUseCase } from './application/use-cases/retry-programs-sync.use-case';
import { ScanProgramSourcesUseCase } from './application/use-cases/scan-program-sources.use-case';
import { SyncProgramsGroupUseCase } from './application/use-cases/sync-programs-group.use-case';
import { JsonGroupRegistry } from './infrastructure/json-group-registry';
import { ProgramsEtlAgentModule } from './infrastructure/programs-etl-agent.module';
import { ProgramsEtlObservabilityModule } from './infrastructure/programs-etl-observability.module';
import { ProgramsEtlPersistenceModule } from './infrastructure/programs-etl-persistence.module';
import { ProgramsEtlQueueModule } from './infrastructure/programs-etl-queue.module';
import { ProgramsEtlSheetsModule } from './infrastructure/programs-etl-sheets.module';
import { ProgramsScanScheduler } from './interface/queue/programs-scan.scheduler';
import { ScanSourcesProcessor } from './interface/queue/scan-sources.processor';
import { SyncGroupProcessor } from './interface/queue/sync-group.processor';
import {
    CATALOG_WRITER_PORT,
    GROUP_REGISTRY_PORT,
    PROGRAMS_AGENT_PORT,
    PROGRAMS_SYNC_LOGGER_PORT,
    PROGRAMS_SYNC_METRICS_PORT,
    PROGRAMS_SYNC_QUEUE_PORT,
    RETRY_PROGRAMS_SYNC_USE_CASE,
    SCAN_PROGRAM_SOURCES_USE_CASE,
    SCHEDULE_PROGRAMS_GROUP_SYNC_SERVICE,
    SHEETS_READER_PORT,
    SOURCE_STATE_REPOSITORY_PORT,
    SYNC_PROGRAMS_GROUP_USE_CASE,
    SYNC_RUN_STORE_PORT,
} from './programs-etl.tokens';

/** groups.json is read from the sources tree (it is not copied into dist). */
const GROUPS_JSON_PATH = join(
    process.cwd(),
    'src/modules/price-policy-rag/tabels-links/groups.json',
);

/**
 * Композиционный корень модуля programs-etl. Scheduler управляется
 * PROGRAMS_ETL_SCHEDULER_ENABLED (по умолчанию выключен).
 */
@Module({
    imports: [
        ProgramsEtlQueueModule,
        ProgramsEtlPersistenceModule,
        ProgramsEtlSheetsModule,
        ProgramsEtlAgentModule,
        ProgramsEtlObservabilityModule,
    ],
    providers: [
        {
            provide: GROUP_REGISTRY_PORT,
            useFactory: () => JsonGroupRegistry.fromFile(GROUPS_JSON_PATH),
        },
        {
            provide: SCHEDULE_PROGRAMS_GROUP_SYNC_SERVICE,
            inject: [GROUP_REGISTRY_PORT, SYNC_RUN_STORE_PORT, PROGRAMS_SYNC_QUEUE_PORT],
            useFactory: (
                registry: GroupRegistryPort,
                runs: SyncRunStorePort,
                queue: ProgramsSyncQueuePort,
            ) =>
                new ScheduleProgramsGroupSyncService(registry, runs, queue, {
                    newId: () => randomUUID(),
                    now: () => new Date(),
                }),
        },
        {
            provide: SCAN_PROGRAM_SOURCES_USE_CASE,
            inject: [
                GROUP_REGISTRY_PORT,
                SHEETS_READER_PORT,
                SOURCE_STATE_REPOSITORY_PORT,
                SYNC_RUN_STORE_PORT,
                SCHEDULE_PROGRAMS_GROUP_SYNC_SERVICE,
                PROGRAMS_SYNC_METRICS_PORT,
                PROGRAMS_SYNC_LOGGER_PORT,
            ],
            useFactory: (
                registry: GroupRegistryPort,
                sheets: SheetsReaderPort,
                sourceState: SourceStateRepositoryPort,
                runs: SyncRunStorePort,
                scheduler: ScheduleProgramsGroupSyncService,
                metrics: ProgramsSyncMetricsPort,
                logger: ProgramsSyncLoggerPort,
            ) =>
                new ScanProgramSourcesUseCase(registry, sheets, sourceState, runs, scheduler, {
                    metrics,
                    logger,
                }),
        },
        {
            provide: SYNC_PROGRAMS_GROUP_USE_CASE,
            inject: [
                GROUP_REGISTRY_PORT,
                SYNC_RUN_STORE_PORT,
                PROGRAMS_AGENT_PORT,
                CATALOG_WRITER_PORT,
                SOURCE_STATE_REPOSITORY_PORT,
                PROGRAMS_SYNC_METRICS_PORT,
                PROGRAMS_SYNC_LOGGER_PORT,
            ],
            useFactory: (
                registry: GroupRegistryPort,
                runs: SyncRunStorePort,
                agent: ProgramsAgentPort,
                writer: CatalogWriterPort,
                sourceState: SourceStateRepositoryPort,
                metrics: ProgramsSyncMetricsPort,
                logger: ProgramsSyncLoggerPort,
            ) =>
                new SyncProgramsGroupUseCase(registry, runs, agent, writer, sourceState, {
                    metrics,
                    logger,
                }),
        },
        {
            provide: RETRY_PROGRAMS_SYNC_USE_CASE,
            inject: [SYNC_RUN_STORE_PORT, SCHEDULE_PROGRAMS_GROUP_SYNC_SERVICE],
            useFactory: (runs: SyncRunStorePort, scheduler: ScheduleProgramsGroupSyncService) =>
                new RetryProgramsSyncUseCase(runs, scheduler),
        },
        ScanSourcesProcessor,
        SyncGroupProcessor,
        ProgramsScanScheduler,
    ],
    exports: [GROUP_REGISTRY_PORT, RETRY_PROGRAMS_SYNC_USE_CASE],
})
export class ProgramsEtlModule {}
