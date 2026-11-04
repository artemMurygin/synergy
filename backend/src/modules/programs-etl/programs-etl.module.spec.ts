import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { LoggerModule } from 'nestjs-pino';
import { PG_POOL } from '../../database/postgres/database.constants';
import { PROGRAMS_ETL_QUEUE_NAMES } from './infrastructure/queue/programs-etl-queue.constants';
import { ProgramsScanScheduler } from './interface/queue/programs-scan.scheduler';
import { ScanSourcesProcessor } from './interface/queue/scan-sources.processor';
import { SyncGroupProcessor } from './interface/queue/sync-group.processor';
import { ProgramsEtlModule } from './programs-etl.module';
import {
    PROGRAMS_SYNC_QUEUE_PORT,
    RETRY_PROGRAMS_SYNC_USE_CASE,
    SCAN_PROGRAM_SOURCES_USE_CASE,
    SYNC_PROGRAMS_GROUP_USE_CASE,
} from './programs-etl.tokens';

describe('ProgramsEtlModule wiring', () => {
    it('compiles and resolves processors, scheduler and use cases', async () => {
        const queue = { add: vi.fn(), upsertJobScheduler: vi.fn() };
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    ignoreEnvFile: true,
                    isGlobal: true,
                    load: [
                        () => ({
                            PROGRAMS_ETL_SCHEDULER_ENABLED: false,
                            PROGRAMS_ETL_OPENAI_MODEL: 'gpt-4o',
                            PROGRAMS_ETL_AGENT_MAX_STEPS: 40,
                            PROGRAMS_ETL_AGENT_TIMEOUT_MS: 1000,
                            PROGRAMS_ETL_SHEETS_MAX_CELLS: 2000,
                            OPENAI_API_KEY: 'test-key',
                        }),
                    ],
                }),
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                ProgramsEtlModule,
            ],
        })
            .overrideProvider(PG_POOL)
            .useValue({})
            .overrideProvider(getQueueToken(PROGRAMS_ETL_QUEUE_NAMES.SCAN))
            .useValue(queue)
            .overrideProvider(getQueueToken(PROGRAMS_ETL_QUEUE_NAMES.SYNC))
            .useValue(queue)
            .compile();

        expect(moduleRef.get(ScanSourcesProcessor)).toBeInstanceOf(ScanSourcesProcessor);
        expect(moduleRef.get(SyncGroupProcessor)).toBeInstanceOf(SyncGroupProcessor);
        expect(moduleRef.get(ProgramsScanScheduler)).toBeInstanceOf(ProgramsScanScheduler);
        for (const token of [
            SCAN_PROGRAM_SOURCES_USE_CASE,
            SYNC_PROGRAMS_GROUP_USE_CASE,
            RETRY_PROGRAMS_SYNC_USE_CASE,
            PROGRAMS_SYNC_QUEUE_PORT,
        ]) {
            expect(moduleRef.get(token)).toBeDefined();
        }
    });
});
