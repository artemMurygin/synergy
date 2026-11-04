import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import {
    PROGRAMS_ETL_JOB_NAMES,
    PROGRAMS_ETL_QUEUE_NAMES,
} from '../../infrastructure/queue/programs-etl-queue.constants';
import type { ScanSourcesJobData } from '../../infrastructure/queue/programs-etl-queue.dto';

export const PROGRAMS_SCAN_SCHEDULER_ID = 'programs-etl-scan';

/** Registers the hourly `scan-sources` job scheduler, only when enabled by configuration. */
@Injectable()
export class ProgramsScanScheduler implements OnApplicationBootstrap {
    constructor(
        @InjectQueue(PROGRAMS_ETL_QUEUE_NAMES.SCAN) private readonly queue: Queue,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (!this.config.get('PROGRAMS_ETL_SCHEDULER_ENABLED', { infer: true })) return;
        const data: ScanSourcesJobData = { scheduledAt: new Date().toISOString() };
        await this.queue.upsertJobScheduler(
            PROGRAMS_SCAN_SCHEDULER_ID,
            { pattern: this.config.get('PROGRAMS_ETL_SCAN_CRON', { infer: true }) },
            {
                name: PROGRAMS_ETL_JOB_NAMES.SCAN_SOURCES,
                data,
                opts: {
                    attempts: this.config.get('PROGRAMS_ETL_ATTEMPTS', { infer: true }),
                    backoff: {
                        type: 'exponential',
                        delay: this.config.get('PROGRAMS_ETL_BACKOFF_MS', { infer: true }),
                    },
                },
            },
        );
    }
}
