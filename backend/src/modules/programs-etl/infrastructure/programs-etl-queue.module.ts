import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PROGRAMS_SYNC_QUEUE_PORT } from '../programs-etl.tokens';
import { BullProgramsSyncQueue } from './queue/bull-programs-sync-queue';
import { PROGRAMS_ETL_QUEUE_NAMES } from './queue/programs-etl-queue.constants';

const COMPLETED_RETENTION_COUNT = 1000;
const FAILED_RETENTION_COUNT = 5000;

/** Queues `programs-etl-scan` / `programs-etl-sync`; the Redis connection is the shared BullModule root. */
@Module({
    imports: [
        BullModule.registerQueue(
            {
                name: PROGRAMS_ETL_QUEUE_NAMES.SCAN,
                defaultJobOptions: {
                    removeOnComplete: COMPLETED_RETENTION_COUNT,
                    removeOnFail: FAILED_RETENTION_COUNT,
                },
            },
            {
                name: PROGRAMS_ETL_QUEUE_NAMES.SYNC,
                defaultJobOptions: {
                    removeOnComplete: COMPLETED_RETENTION_COUNT,
                    removeOnFail: FAILED_RETENTION_COUNT,
                },
            },
        ),
    ],
    providers: [{ provide: PROGRAMS_SYNC_QUEUE_PORT, useClass: BullProgramsSyncQueue }],
    exports: [BullModule, PROGRAMS_SYNC_QUEUE_PORT],
})
export class ProgramsEtlQueueModule {}
