import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { SyncGroupJob } from '../../application/models/sync-commands';
import type { ProgramsSyncQueuePort } from '../../application/ports/programs-etl.ports';
import {
    PROGRAMS_ETL_JOB_NAMES,
    PROGRAMS_ETL_QUEUE_NAMES,
    PROGRAMS_ETL_SYNC_JOB_OPTIONS,
    programsSyncJobId,
} from './programs-etl-queue.constants';
import type { SyncGroupJobData } from './programs-etl-queue.dto';

@Injectable()
export class BullProgramsSyncQueue implements ProgramsSyncQueuePort {
    constructor(@InjectQueue(PROGRAMS_ETL_QUEUE_NAMES.SYNC) private readonly queue: Queue) {}

    async enqueueGroup(job: SyncGroupJob): Promise<void> {
        const data: SyncGroupJobData = {
            runId: job.runId,
            groupId: job.groupId,
            changedSources: job.changedSources.map((s) => ({
                sourceId: s.sourceId,
                observedHash: s.observedHash,
            })),
            ...(job.previousRunId === undefined ? {} : { previousRunId: job.previousRunId }),
        };
        await this.queue.add(PROGRAMS_ETL_JOB_NAMES.SYNC_GROUP, data, {
            jobId: programsSyncJobId(job.runId),
            attempts: PROGRAMS_ETL_SYNC_JOB_OPTIONS.attempts,
            backoff: PROGRAMS_ETL_SYNC_JOB_OPTIONS.backoff,
        });
    }
}
